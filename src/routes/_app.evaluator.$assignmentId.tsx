import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import type { Competency, EvaluationScore, Goal, GoalCategory, VGoalCategoryResult } from "@/lib/db-types";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_app/evaluator/$assignmentId")({
  component: EvaluationForm,
});

interface ScoreState {
  score: number | null;
  evidence: string;
  saving?: boolean;
  saved?: boolean;
}

function EvaluationForm() {
  const { assignmentId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: assignment } = useQuery({
    queryKey: ["assignment", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_assignment_progress")
        .select("*")
        .eq("assignment_id", assignmentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: competencies } = useQuery({
    queryKey: ["competencies-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competencies")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data as Competency[];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["scores", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluation_scores")
        .select("*")
        .eq("assignment_id", assignmentId);
      if (error) throw error;
      return data as EvaluationScore[];
    },
  });

  const [state, setState] = useState<Record<string, ScoreState>>({});

  useEffect(() => {
    if (existing && competencies) {
      const init: Record<string, ScoreState> = {};
      competencies.forEach((c) => {
        const ex = existing.find((s) => s.competency_id === c.id);
        init[c.id] = { score: ex?.score ?? null, evidence: ex?.evidence ?? "" };
      });
      setState(init);
    }
  }, [existing, competencies]);

  const saveMutation = useMutation({
    mutationFn: async ({ competencyId, score, evidence }: { competencyId: string; score: number; evidence: string }) => {
      const { error } = await supabase
        .from("evaluation_scores")
        .upsert(
          { assignment_id: assignmentId, competency_id: competencyId, score, evidence: evidence || null },
          { onConflict: "assignment_id,competency_id" }
        );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      setState((s) => ({ ...s, [vars.competencyId]: { ...s[vars.competencyId], saving: false, saved: true } }));
      qc.invalidateQueries({ queryKey: ["scores", assignmentId] });
      qc.invalidateQueries({ queryKey: ["assignment", assignmentId] });
      setTimeout(() => {
        setState((s) => ({ ...s, [vars.competencyId]: { ...s[vars.competencyId], saved: false } }));
      }, 1500);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleScore = (competencyId: string, score: number) => {
    setState((s) => ({ ...s, [competencyId]: { ...s[competencyId], score, saving: true } }));
    const evidence = state[competencyId]?.evidence ?? "";
    saveMutation.mutate({ competencyId, score, evidence });
  };

  const handleEvidenceBlur = (competencyId: string) => {
    const s = state[competencyId];
    if (!s?.score) return;
    setState((st) => ({ ...st, [competencyId]: { ...s, saving: true } }));
    saveMutation.mutate({ competencyId, score: s.score, evidence: s.evidence });
  };

  const filled = Object.values(state).filter((s) => s.score != null).length;
  const total = competencies?.length ?? 0;
  const pct = total ? Math.round((100 * filled) / total) : 0;

  return (
    <div className="space-y-6">
      <Link to="/evaluator" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{assignment?.evaluatee_name ?? "..."}</h1>
        <p className="text-sm text-muted-foreground">
          Você está avaliando como <strong>{assignment?.evaluator_type_label}</strong>. As notas são salvas
          automaticamente.
        </p>
      </div>

      <Card className="sticky top-4 z-10">
        <CardContent className="py-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Progresso</span>
            <span>{filled} de {total} competências ({pct}%)</span>
          </div>
          <Progress value={pct} />
        </CardContent>
      </Card>

      <div className="space-y-4">
        {competencies?.map((c) => {
          const s = state[c.id] ?? { score: null, evidence: "" };
          return (
            <Card key={c.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.dimension} • {c.category}</p>
                    <CardTitle className="text-base mt-1">{c.name}</CardTitle>
                    {c.description && <p className="text-sm text-muted-foreground mt-1">{c.description}</p>}
                  </div>
                  {s.saved && <Check className="h-4 w-4 text-green-600" />}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const desc = c[`level_${n}_descriptor` as keyof Competency] as string | null;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleScore(c.id, n)}
                        className={`text-left rounded-md border p-3 text-xs transition-colors ${
                          s.score === n ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"
                        }`}
                      >
                        <div className="font-semibold text-sm mb-1">Nível {n}</div>
                        <div className="text-muted-foreground line-clamp-4">{desc}</div>
                      </button>
                    );
                  })}
                </div>
                <Textarea
                  placeholder="Evidências ou comentários (opcional)"
                  value={s.evidence}
                  onChange={(e) => setState((st) => ({ ...st, [c.id]: { ...s, evidence: e.target.value } }))}
                  onBlur={() => handleEvidenceBlur(c.id)}
                  rows={2}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {assignment?.evaluator_type_code === "gestor" && assignment?.evaluatee_id && assignment?.cycle_id && (
        <GoalsSection evaluateeId={assignment.evaluatee_id} cycleId={assignment.cycle_id} />
      )}

      <div className="flex justify-end">
        <Button onClick={() => navigate({ to: "/evaluator" })}>Concluir</Button>
      </div>
    </div>
  );
}

function GoalsSection({ evaluateeId, cycleId }: { evaluateeId: string; cycleId: string }) {
  const qc = useQueryClient();

  const { data: goals } = useQuery({
    queryKey: ["eval-goals", evaluateeId, cycleId],
    queryFn: async () => {
      const { data } = await supabase
        .from("goals").select("*")
        .eq("evaluatee_id", evaluateeId).eq("cycle_id", cycleId);
      return (data ?? []) as Goal[];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["eval-goal-cats", cycleId],
    queryFn: async () => {
      const { data } = await supabase.from("goal_categories").select("*").eq("cycle_id", cycleId);
      return (data ?? []) as GoalCategory[];
    },
  });

  const { data: catResults } = useQuery({
    queryKey: ["eval-goal-cat-results", evaluateeId, cycleId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v_goal_category_results").select("*")
        .eq("evaluatee_id", evaluateeId).eq("cycle_id", cycleId);
      return (data ?? []) as VGoalCategoryResult[];
    },
  });

  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!goals) return;
    const init: Record<string, string> = {};
    goals.forEach((g) => { init[g.id] = g.obtained_score != null ? String(g.obtained_score) : ""; });
    setLocal(init);
  }, [goals]);

  const save = useMutation({
    mutationFn: async ({ id, obtained }: { id: string; obtained: number | null }) => {
      const { error } = await supabase.from("goals").update({ obtained_score: obtained }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-goals", evaluateeId, cycleId] });
      qc.invalidateQueries({ queryKey: ["eval-goal-cat-results", evaluateeId, cycleId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!goals?.length && !categories?.length) return null;

  const byCategory = (categories ?? []).map((cat) => ({
    cat,
    items: (goals ?? []).filter((g) => g.category_id === cat.id),
    result: catResults?.find((r) => r.category_id === cat.id),
  })).filter((g) => g.items.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Metas</CardTitle>
        <p className="text-xs text-muted-foreground">Preencha a nota obtida (0 a 5). % de alcance e ponderado são calculados automaticamente.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {byCategory.map(({ cat, items, result }) => (
          <div key={cat.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{cat.name}</div>
                <div className="text-xs text-muted-foreground">Peso: {cat.weight}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                Alcance: <strong>{result?.pct_achievement != null ? (result.pct_achievement * 100).toFixed(0) + "%" : "—"}</strong>
                {" · "}Ponderado: <strong>{result?.weighted_result != null ? Number(result.weighted_result).toFixed(3) : "—"}</strong>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-24 text-right">Esperada</TableHead>
                  <TableHead className="w-32">Obtida</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="text-sm">{g.description}</TableCell>
                    <TableCell className="text-right">{g.expected_score}</TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.5" min="0" max="5"
                        value={local[g.id] ?? ""}
                        onChange={(e) => setLocal((s) => ({ ...s, [g.id]: e.target.value }))}
                        onBlur={(e) => {
                          const raw = e.target.value;
                          const parsed = raw === "" ? null : Number(raw);
                          if (parsed !== g.obtained_score) save.mutate({ id: g.id, obtained: parsed });
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
