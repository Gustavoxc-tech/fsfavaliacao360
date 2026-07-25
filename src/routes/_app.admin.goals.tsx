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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { EvaluationCycle, GoalCategory, Goal, Evaluatee, Person } from "@/lib/db-types";

export const Route = createFileRoute("/_app/admin/goals")({
  component: AdminGoals,
});

function AdminGoals() {
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState<string | undefined>();
  const [evaluateeId, setEvaluateeId] = useState<string | undefined>();

  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", weight: "" });
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalForm, setGoalForm] = useState({ category_id: "", description: "", expected_score: "5" });

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

  const createGoal = useMutation({
    mutationFn: async () => {
      if (!evaluateeId) throw new Error("Selecione um avaliado.");
      if (!goalForm.category_id || !goalForm.description) throw new Error("Preencha categoria e descrição.");
      const { error } = await supabase.from("goals").insert({
        cycle_id: cycleId,
        evaluatee_id: evaluateeId,
        category_id: goalForm.category_id,
        description: goalForm.description,
        expected_score: Number(goalForm.expected_score) || 5,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meta criada");
      setGoalOpen(false);
      setGoalForm({ category_id: "", description: "", expected_score: "5" });
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
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="w-32">Peso</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Input
                      defaultValue={c.name}
                      onBlur={(e) => e.target.value !== c.name && updateCategory.mutate({ id: c.id, patch: { name: e.target.value } })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" step="0.01"
                      defaultValue={c.weight}
                      onBlur={(e) => Number(e.target.value) !== c.weight && updateCategory.mutate({ id: c.id, patch: { weight: Number(e.target.value) } })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => deleteCategory.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {categories?.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">Nenhuma categoria neste ciclo.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
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
            <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={!evaluateeId || !categories?.length}><Plus className="h-4 w-4 mr-1" /> Nova meta</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nova meta</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Categoria</Label>
                    <Select value={goalForm.category_id} onValueChange={(v) => setGoalForm({ ...goalForm, category_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Descrição</Label><Textarea value={goalForm.description} onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} /></div>
                  <div><Label>Nota esperada</Label><Input type="number" step="0.5" value={goalForm.expected_score} onChange={(e) => setGoalForm({ ...goalForm, expected_score: e.target.value })} /></div>
                  <Button onClick={() => createGoal.mutate()} disabled={createGoal.isPending}>Criar</Button>
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
