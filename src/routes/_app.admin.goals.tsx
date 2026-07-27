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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { EvaluationCycle, GoalCategory, Goal, GoalTemplate, Evaluatee, Person } from "@/lib/db-types";

export const Route = createFileRoute("/_app/admin/goals")({
  component: AdminGoals,
});

function AdminGoals() {
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState<string | undefined>();
  const [evaluateeId, setEvaluateeId] = useState<string | undefined>();

  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", weight: "" });
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [templateOpen, setTemplateOpen] = useState<{ open: boolean; categoryId?: string }>({ open: false });
  const [templateForm, setTemplateForm] = useState({ description: "", expected_score: "5" });
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());

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
      return (data ?? []) as Goal[];
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["goal-templates", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data } = await supabase.from("goal_templates").select("*").eq("cycle_id", cycleId);
      return (data ?? []) as GoalTemplate[];
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
    mutationFn: async () => {
      if (!templateOpen.categoryId) throw new Error("Categoria não selecionada.");
      if (!templateForm.description) throw new Error("Preencha a descrição.");
      const { error } = await supabase.from("goal_templates").insert({
        cycle_id: cycleId,
        category_id: templateOpen.categoryId,
        description: templateForm.description,
        expected_score: Number(templateForm.expected_score) || 5,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meta adicionada ao catálogo");
      setTemplateOpen({ open: false });
      setTemplateForm({ description: "", expected_score: "5" });
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

  // Atribui ao avaliado selecionado todas as metas do catálogo marcadas no diálogo,
  // copiando descrição e nota esperada do template (o gestor lança a nota obtida depois).
  const assignTemplates = useMutation({
    mutationFn: async () => {
      if (!evaluateeId) throw new Error("Selecione um avaliado.");
      if (selectedTemplateIds.size === 0) throw new Error("Selecione ao menos uma meta do catálogo.");
      const alreadyAssignedTemplateIds = new Set((goals ?? []).map((g) => g.template_id).filter(Boolean));
      const rows = [...selectedTemplateIds]
        .filter((tid) => !alreadyAssignedTemplateIds.has(tid))
        .map((tid) => {
          const t = templates?.find((tp) => tp.id === tid)!;
          return {
            cycle_id: cycleId,
            evaluatee_id: evaluateeId,
            category_id: t.category_id,
            template_id: t.id,
            description: t.description,
            expected_score: t.expected_score,
          };
        });
      if (rows.length === 0) return;
      const { error } = await supabase.from("goals").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Metas atribuídas");
      setAssignOpen(false);
      setSelectedTemplateIds(new Set());
      qc.invalidateQueries({ queryKey: ["goals", cycleId, evaluateeId] });
    },
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
          <CardTitle className="text-base">Categorias de metas</CardTitle>
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
        <CardContent className="space-y-2">
          {categories?.map((c) => {
            const catTemplates = (templates ?? []).filter((t) => t.category_id === c.id);
            const isExpanded = expandedCats.has(c.id);
            return (
              <div key={c.id} className="border rounded-md">
                <div className="flex items-center gap-3 px-3 py-2">
                  <button
                    type="button"
                    className="text-muted-foreground"
                    onClick={() =>
                      setExpandedCats((prev) => {
                        const next = new Set(prev);
                        next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                        return next;
                      })
                    }
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <Input
                    className="max-w-xs"
                    defaultValue={c.name}
                    onBlur={(e) => e.target.value !== c.name && updateCategory.mutate({ id: c.id, patch: { name: e.target.value } })}
                  />
                  <Input
                    className="w-24"
                    type="number" step="0.01"
                    defaultValue={c.weight}
                    onBlur={(e) => Number(e.target.value) !== c.weight && updateCategory.mutate({ id: c.id, patch: { weight: Number(e.target.value) } })}
                  />
                  <span className="text-xs text-muted-foreground">{catTemplates.length} metas no catálogo</span>
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => deleteCategory.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {isExpanded && (
                  <div className="border-t px-3 py-3 space-y-2 bg-muted/30">
                    {catTemplates.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-2 text-sm bg-background border rounded px-3 py-2">
                        <span>{t.description}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-muted-foreground">Esperada: {t.expected_score}</span>
                          <Button variant="ghost" size="sm" onClick={() => deleteTemplate.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    ))}
                    {catTemplates.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhuma meta cadastrada nesta categoria ainda.</p>
                    )}
                    <Dialog
                      open={templateOpen.open && templateOpen.categoryId === c.id}
                      onOpenChange={(o) => setTemplateOpen({ open: o, categoryId: c.id })}
                    >
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" /> Nova meta no catálogo</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Nova meta em "{c.name}"</DialogTitle></DialogHeader>
                        <div className="space-y-3">
                          <div><Label>Descrição</Label><Textarea value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} /></div>
                          <div><Label>Nota esperada</Label><Input type="number" step="0.5" value={templateForm.expected_score} onChange={(e) => setTemplateForm({ ...templateForm, expected_score: e.target.value })} /></div>
                          <Button onClick={() => createTemplate.mutate()} disabled={createTemplate.isPending}>Adicionar ao catálogo</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </div>
            );
          })}
          {categories?.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">Nenhuma categoria neste ciclo.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 gap-4">
          <CardTitle className="text-base">Metas por avaliado</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={evaluateeId} onValueChange={setEvaluateeId}>
              <SelectTrigger className="w-[280px]"><SelectValue placeholder="Selecionar avaliado" /></SelectTrigger>
              <SelectContent>
                {evaluatees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.people?.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Dialog open={assignOpen} onOpenChange={(o) => { setAssignOpen(o); if (!o) setSelectedTemplateIds(new Set()); }}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={!evaluateeId || !templates?.length}><Plus className="h-4 w-4 mr-1" /> Atribuir metas do catálogo</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Selecionar metas do catálogo</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  {categories?.map((c) => {
                    const catTemplates = (templates ?? []).filter((t) => t.category_id === c.id);
                    if (catTemplates.length === 0) return null;
                    const assignedTemplateIds = new Set((goals ?? []).map((g) => g.template_id));
                    return (
                      <div key={c.id}>
                        <p className="text-sm font-medium mb-2">{c.name}</p>
                        <div className="space-y-1">
                          {catTemplates.map((t) => {
                            const alreadyAssigned = assignedTemplateIds.has(t.id);
                            return (
                              <label key={t.id} className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded ${alreadyAssigned ? "opacity-50" : "hover:bg-accent/50 cursor-pointer"}`}>
                                <Checkbox
                                  disabled={alreadyAssigned}
                                  checked={alreadyAssigned || selectedTemplateIds.has(t.id)}
                                  onCheckedChange={(checked) =>
                                    setSelectedTemplateIds((prev) => {
                                      const next = new Set(prev);
                                      checked ? next.add(t.id) : next.delete(t.id);
                                      return next;
                                    })
                                  }
                                />
                                <span>{t.description}{alreadyAssigned && <span className="text-xs text-muted-foreground"> (já atribuída)</span>}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <Button onClick={() => assignTemplates.mutate()} disabled={assignTemplates.isPending || selectedTemplateIds.size === 0}>
                    Atribuir selecionadas
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-24 text-right">Esperada</TableHead>
                <TableHead className="w-24 text-right">Obtida</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {goals?.map((g) => {
                const cat = categories?.find((c) => c.id === g.category_id);
                return (
                  <TableRow key={g.id}>
                    <TableCell><Badge variant="secondary">{cat?.name ?? "—"}</Badge></TableCell>
                    <TableCell className="max-w-md">{g.description}</TableCell>
                    <TableCell className="text-right">{g.expected_score}</TableCell>
                    <TableCell className="text-right">{g.obtained_score ?? "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => deleteGoal.mutate(g.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!goals || goals.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  {evaluateeId ? "Nenhuma meta cadastrada." : "Selecione um avaliado."}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
