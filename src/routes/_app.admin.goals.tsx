import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { EvaluationCycle, GoalCategory, Goal, Evaluatee, Person, GoalTemplate } from "@/lib/db-types";

export const Route = createFileRoute("/_app/admin/goals")({
  component: AdminGoals,
});

function AdminGoals() {
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState<string | undefined>();
  const [evaluateeId, setEvaluateeId] = useState<string | undefined>();

  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", weight: "" });
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [tplOpen, setTplOpen] = useState<string | null>(null);
  const [tplForm, setTplForm] = useState({ description: "", expected_score: "5" });
  const [assignOpen, setAssignOpen] = useState<string | null>(null); // category_id
  const [selectedTpls, setSelectedTpls] = useState<Record<string, boolean>>({});

  const { data: cycles } = useQuery({
    queryKey: ["cycles"],
    queryFn: async () => {
      const { data } = await supabase.from("evaluation_cycles").select("*").order("start_date", { ascending: false });
      return (data ?? []) as EvaluationCycle[];
    },
  });

  useEffect(() => {
    if (!cycleId && cycles && cycles.length) setCycleId(cycles[0].id);
  }, [cycles, cycleId]);

  const { data: categories } = useQuery({
    queryKey: ["goal-categories", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data } = await supabase.from("goal_categories").select("*").eq("cycle_id", cycleId).order("name");
      return (data ?? []) as GoalCategory[];
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["goal-templates", cycleId],
    enabled: !!cycleId && !!categories?.length,
    queryFn: async () => {
      const ids = (categories ?? []).map((c) => c.id);
      if (!ids.length) return [];
      const { data } = await supabase.from("goal_templates").select("*").in("category_id", ids);
      return (data ?? []) as GoalTemplate[];
    },
  });

  const { data: evaluatees } = useQuery({
    queryKey: ["evaluatees-cycle", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data } = await supabase
        .from("evaluatees")
        .select("*, people(full_name)")
        .eq("cycle_id", cycleId);
      return (data ?? []) as (Evaluatee & { people: Pick<Person, "full_name"> })[];
    },
  });

  const { data: goals } = useQuery({
    queryKey: ["goals", cycleId, evaluateeId],
    enabled: !!cycleId && !!evaluateeId,
    queryFn: async () => {
      const { data } = await supabase.from("goals").select("*").eq("cycle_id", cycleId).eq("evaluatee_id", evaluateeId);
      return (data ?? []) as (Goal & { template_id?: string | null })[];
    },
  });

  const totalWeight = useMemo(
    () => (categories ?? []).reduce((s, c) => s + Number(c.weight ?? 0), 0),
    [categories]
  );

  const createCategory = useMutation({
    mutationFn: async () => {
      const w = Number(catForm.weight);
      if (!catForm.name || isNaN(w)) throw new Error("Preencha nome e peso.");
      const { error } = await supabase.from("goal_categories").insert({
        cycle_id: cycleId, name: catForm.name, weight: w,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria criada");
      setCatOpen(false);
      setCatForm({ name: "", weight: "" });
      qc.invalidateQueries({ queryKey: ["goal-categories", cycleId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<GoalCategory> }) => {
      const { error } = await supabase.from("goal_categories").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goal-categories", cycleId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goal_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goal-categories", cycleId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const createTemplate = useMutation({
    mutationFn: async (category_id: string) => {
      if (!tplForm.description) throw new Error("Descrição obrigatória.");
      const { error } = await supabase.from("goal_templates").insert({
        category_id,
        description: tplForm.description,
        expected_score: Number(tplForm.expected_score) || 5,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template criado");
      setTplOpen(null);
      setTplForm({ description: "", expected_score: "5" });
      qc.invalidateQueries({ queryKey: ["goal-templates", cycleId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goal_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goal-templates", cycleId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const assignTemplates = useMutation({
    mutationFn: async (category_id: string) => {
      if (!evaluateeId) throw new Error("Selecione um avaliado.");
      const ids = Object.entries(selectedTpls).filter(([, v]) => v).map(([k]) => k);
      if (!ids.length) throw new Error("Selecione ao menos um template.");
      const tpls = (templates ?? []).filter((t) => ids.includes(t.id));
      const existing = (goals ?? []).filter((g) => g.template_id && ids.includes(g.template_id));
      const toInsert = tpls
        .filter((t) => !existing.some((g) => g.template_id === t.id))
        .map((t) => ({
          cycle_id: cycleId,
          evaluatee_id: evaluateeId,
          category_id,
          template_id: t.id,
          description: t.description,
          expected_score: t.expected_score,
        }));
      if (!toInsert.length) throw new Error("Todas as metas selecionadas já foram criadas.");
      const { error } = await supabase.from("goals").insert(toInsert);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Metas adicionadas");
      setAssignOpen(null);
      setSelectedTpls({});
      qc.invalidateQueries({ queryKey: ["goals", cycleId, evaluateeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateGoalObtained = useMutation({
    mutationFn: async ({ id, obtained }: { id: string; obtained: number | null }) => {
      const { error } = await supabase.from("goals").update({ obtained_score: obtained }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals", cycleId, evaluateeId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals", cycleId, evaluateeId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const weightOk = Math.abs(totalWeight - 1) < 0.001 || Math.abs(totalWeight - 100) < 0.001;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-4 flex items-center gap-3">
          <Label>Ciclo:</Label>
          <Select value={cycleId} onValueChange={(v) => { setCycleId(v); setEvaluateeId(undefined); }}>
            <SelectTrigger className="w-[300px]"><SelectValue placeholder="Selecionar ciclo" /></SelectTrigger>
            <SelectContent>
              {cycles?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Categorias e templates de metas</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={weightOk ? "default" : "secondary"}>
              Soma dos pesos: {totalWeight.toFixed(2)} {weightOk ? "✓" : "(deve somar 1.00 ou 100)"}
            </Badge>
            <Dialog open={catOpen} onOpenChange={setCatOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={!cycleId}><Plus className="h-4 w-4 mr-1" /> Nova categoria</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nova categoria</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Nome</Label><Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} /></div>
                  <div><Label>Peso (ex: 0.4 ou 40)</Label><Input value={catForm.weight} onChange={(e) => setCatForm({ ...catForm, weight: e.target.value })} /></div>
                  <Button onClick={() => createCategory.mutate()} disabled={createCategory.isPending}>Criar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {categories?.map((c) => {
            const catTpls = (templates ?? []).filter((t) => t.category_id === c.id);
            const expanded = expandedCats[c.id] ?? false;
            return (
              <div key={c.id} className="border rounded-md">
                <div className="flex items-center gap-2 p-2">
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setExpandedCats((s) => ({ ...s, [c.id]: !expanded }))}
                    className="h-7 w-7 p-0"
                  >
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                  <Input
                    className="max-w-sm"
                    defaultValue={c.name}
                    onBlur={(e) => e.target.value !== c.name && updateCategory.mutate({ id: c.id, patch: { name: e.target.value } })}
                  />
                  <Input
                    className="w-28"
                    type="number" step="0.01"
                    defaultValue={c.weight}
                    onBlur={(e) => Number(e.target.value) !== c.weight && updateCategory.mutate({ id: c.id, patch: { weight: Number(e.target.value) } })}
                  />
                  <Badge variant="secondary" className="ml-auto">{catTpls.length} template(s)</Badge>
                  <Button variant="ghost" size="sm" onClick={() => deleteCategory.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {expanded && (
                  <div className="border-t p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-muted-foreground">Templates desta categoria</div>
                      <Dialog open={tplOpen === c.id} onOpenChange={(v) => { setTplOpen(v ? c.id : null); if (!v) setTplForm({ description: "", expected_score: "5" }); }}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" /> Novo template</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Novo template — {c.name}</DialogTitle></DialogHeader>
                          <div className="space-y-3">
                            <div><Label>Descrição</Label><Textarea value={tplForm.description} onChange={(e) => setTplForm({ ...tplForm, description: e.target.value })} /></div>
                            <div><Label>Nota esperada</Label><Input type="number" step="0.5" value={tplForm.expected_score} onChange={(e) => setTplForm({ ...tplForm, expected_score: e.target.value })} /></div>
                            <Button onClick={() => createTemplate.mutate(c.id)} disabled={createTemplate.isPending}>Criar</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    {catTpls.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-2">Nenhum template cadastrado.</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Descrição</TableHead>
                            <TableHead className="w-24 text-right">Esperada</TableHead>
                            <TableHead className="w-16"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {catTpls.map((t) => (
                            <TableRow key={t.id}>
                              <TableCell className="text-sm">{t.description}</TableCell>
                              <TableCell className="text-right">{t.expected_score}</TableCell>
                              <TableCell><Button variant="ghost" size="sm" onClick={() => deleteTemplate.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {categories?.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-4">Nenhuma categoria neste ciclo.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 gap-4">
          <CardTitle className="text-base">Metas por avaliado</CardTitle>
          <Select value={evaluateeId} onValueChange={setEvaluateeId}>
            <SelectTrigger className="w-[280px]"><SelectValue placeholder="Selecionar avaliado" /></SelectTrigger>
            <SelectContent>
              {evaluatees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.people?.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-4">
          {!evaluateeId && (
            <div className="text-sm text-muted-foreground text-center py-6">Selecione um avaliado.</div>
          )}
          {evaluateeId && categories?.map((cat) => {
            const catTpls = (templates ?? []).filter((t) => t.category_id === cat.id);
            const catGoals = (goals ?? []).filter((g) => g.category_id === cat.id);
            const assignedTplIds = new Set(catGoals.map((g) => g.template_id).filter(Boolean));
            const availableTpls = catTpls.filter((t) => !assignedTplIds.has(t.id));
            return (
              <div key={cat.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{cat.name}</div>
                    <div className="text-xs text-muted-foreground">Peso: {cat.weight} · {catGoals.length} meta(s)</div>
                  </div>
                  <Dialog
                    open={assignOpen === cat.id}
                    onOpenChange={(v) => { setAssignOpen(v ? cat.id : null); if (!v) setSelectedTpls({}); }}
                  >
                    <DialogTrigger asChild>
                      <Button size="sm" disabled={availableTpls.length === 0}>
                        <Plus className="h-4 w-4 mr-1" /> Adicionar metas
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Selecionar templates — {cat.name}</DialogTitle></DialogHeader>
                      <div className="space-y-2 max-h-80 overflow-auto">
                        {availableTpls.length === 0 && (
                          <div className="text-sm text-muted-foreground">Todos os templates já foram atribuídos.</div>
                        )}
                        {availableTpls.map((t) => (
                          <label key={t.id} className="flex items-start gap-2 p-2 rounded border hover:bg-accent cursor-pointer">
                            <Checkbox
                              checked={!!selectedTpls[t.id]}
                              onCheckedChange={(v) => setSelectedTpls((s) => ({ ...s, [t.id]: !!v }))}
                            />
                            <div className="text-sm flex-1">
                              <div>{t.description}</div>
                              <div className="text-xs text-muted-foreground">Esperada: {t.expected_score}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                      <Button onClick={() => assignTemplates.mutate(cat.id)} disabled={assignTemplates.isPending}>Confirmar</Button>
                    </DialogContent>
                  </Dialog>
                </div>
                {catGoals.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-24 text-right">Esperada</TableHead>
                        <TableHead className="w-32 text-right">Obtida</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catGoals.map((g) => (
                        <TableRow key={g.id}>
                          <TableCell className="text-sm max-w-md">{g.description}</TableCell>
                          <TableCell className="text-right">{g.expected_score}</TableCell>
                          <TableCell>
                            <Input
                              type="number" step="0.5" min="0" max="5"
                              className="text-right"
                              defaultValue={g.obtained_score ?? ""}
                              onBlur={(e) => {
                                const raw = e.target.value;
                                const parsed = raw === "" ? null : Number(raw);
                                if (parsed !== g.obtained_score) updateGoalObtained.mutate({ id: g.id, obtained: parsed });
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => deleteGoal.mutate(g.id)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            );
          })}
          {evaluateeId && categories?.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6">Cadastre categorias e templates acima primeiro.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
