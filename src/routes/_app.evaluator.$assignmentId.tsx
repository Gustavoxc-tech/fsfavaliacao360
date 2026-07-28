import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, ChevronRight, GraduationCap, Award, Target, Users } from "lucide-react";
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

type TabKey = "competencies" | "goals" | "academic" | "certifications";

function EvaluationForm() {
  const { assignmentId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTabRaw] = useState<TabKey>("competencies");
  const tabOrder: TabKey[] = ["competencies", "goals", "academic", "certifications"];
  const [visitedMax, setVisitedMax] = useState(0);
  const setTab = (t: TabKey) => {
    setTabRaw(t);
    setVisitedMax((m) => Math.max(m, tabOrder.indexOf(t)));
  };

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
    queryKey: ["competencies-for-evaluatee", assignment?.evaluatee_id],
    enabled: !!assignment?.evaluatee_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competency_assignments")
        .select("competencies(*)")
        .eq("evaluatee_id", assignment!.evaluatee_id);
      if (error) throw error;
      let list = (data ?? [])
        .map((row: any) => row.competencies as Competency)
        .filter((c: Competency | null): c is Competency => !!c && c.is_active)
        .sort((a, b) => a.display_order - b.display_order);
      if (list.length === 0) {
        const { data: all, error: err2 } = await supabase
          .from("competencies")
          .select("*")
          .eq("is_active", true)
          .order("display_order", { ascending: true });
        if (err2) throw err2;
        list = (all ?? []) as Competency[];
      }
      return list;
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
  const compsComplete = total > 0 && filled >= total;

  // Progresso por etapas do fluxo (não apenas da aba de competências)
  const stepsDone = [
    compsComplete, // etapa 1: Avaliação 360°
    visitedMax >= 1, // etapa 2: Metas
    visitedMax >= 2, // etapa 3: Qualificações
    assignment?.status === "completed", // etapa 4: Certificações + conclusão
  ].filter(Boolean).length;
  const stepPct = Math.round((stepsDone / 4) * 100);

  const completeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("evaluation_assignments")
        .update({ status: "completed", submitted_at: new Date().toISOString() })
        .eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignment", assignmentId] });
      qc.invalidateQueries({ queryKey: ["my-assignments"] });
      qc.invalidateQueries({ queryKey: ["admin-progress"] });
      toast.success("Avaliação concluída!");
      navigate({ to: "/evaluator" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isGestor = assignment?.evaluator_type_code === "gestor";

  const { data: evaluatee } = useQuery({
    queryKey: ["evaluatee-person", assignment?.evaluatee_id],
    enabled: !!assignment?.evaluatee_id,
    queryFn: async () => {
      const { data } = await supabase.from("evaluatees").select("person_id").eq("id", assignment!.evaluatee_id).maybeSingle();
      return data as { person_id: string } | null;
    },
  });
  const personId = evaluatee?.person_id ?? null;

  return (
    <div className="space-y-6">
      <Link to="/evaluator" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{assignment?.evaluatee_name ?? "..."}</h1>
        <p className="text-sm text-muted-foreground">
          Você está avaliando como <strong>{assignment?.evaluator_type_label}</strong>. As notas são salvas automaticamente.
        </p>
      </div>

      <Card className="sticky top-4 z-10 card-hover">
        <CardContent className="py-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Progresso da Avaliação</span>
            <span>{stepsDone} de 4 etapas ({stepPct}%)</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full progress-gradient transition-[width] duration-500"
              style={{ width: `${stepPct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="competencies"><Users className="h-4 w-4 mr-1" />Avaliação 360°</TabsTrigger>
          <TabsTrigger value="goals"><Target className="h-4 w-4 mr-1" />Metas</TabsTrigger>
          <TabsTrigger value="academic"><GraduationCap className="h-4 w-4 mr-1" />Qualificações</TabsTrigger>
          <TabsTrigger value="certifications"><Award className="h-4 w-4 mr-1" />Certificações</TabsTrigger>
        </TabsList>

        <TabsContent value="competencies" className="space-y-4 mt-4">
          {competencies?.map((c) => {
            const s = state[c.id] ?? { score: null, evidence: "" };
            return (
              <Card key={c.id} className="card-hover">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.dimension} • {c.category}</p>
                      <CardTitle className="text-base mt-1">{c.name}</CardTitle>
                      {c.description && <p className="text-sm text-muted-foreground mt-1">{c.description}</p>}
                    </div>
                    {s.saved && <Check className="h-4 w-4 text-success" />}
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
                          className={`text-left rounded-md border p-3 text-xs transition-all ${
                            s.score === n
                              ? "border-primary bg-primary/5 ring-2 ring-primary shadow-sm"
                              : "hover:bg-accent hover:border-primary/40"
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
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {compsComplete ? "Todas as competências avaliadas ✓" : `Faltam ${total - filled} competência(s).`}
            </span>
            <Button onClick={() => setTab("goals")}>
              Ir para Avaliação de Metas <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="goals" className="mt-4 space-y-4">
          {isGestor && assignment?.evaluatee_id && assignment?.cycle_id ? (
            <GoalsSection evaluateeId={assignment.evaluatee_id} cycleId={assignment.cycle_id} />
          ) : (
            <Card className="card-hover">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Somente o avaliador do tipo <strong>gestor</strong> preenche as notas obtidas nas metas.
                Você pode avançar para as próximas seções.
              </CardContent>
            </Card>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setTab("academic")}>
              Ir para Qualificações <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="academic" className="mt-4 space-y-4">
          <AcademicView personId={personId} />
          <div className="flex justify-end">
            <Button onClick={() => setTab("certifications")}>
              Ir para Certificações <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="certifications" className="mt-4 space-y-4">
          <CertificationsView personId={personId} />
          <div className="flex justify-end">
            <Button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {completeMutation.isPending ? "Concluindo..." : "Concluir Avaliação"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
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

  const byCategory = (categories ?? []).map((cat) => ({
    cat,
    items: (goals ?? []).filter((g) => g.category_id === cat.id),
    result: catResults?.find((r) => r.category_id === cat.id),
  })).filter((g) => g.items.length > 0);

  if (!byCategory.length) {
    return (
      <Card className="card-hover">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma meta cadastrada para este colaborador neste ciclo.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-hover">
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
                Alcance: <strong>{result?.pct_alcance != null ? (result.pct_alcance * 100).toFixed(0) + "%" : "—"}</strong>
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

function AcademicView({ personId }: { personId: string | null }) {
  const { data } = useQuery({
    queryKey: ["view-academic", personId],
    enabled: !!personId,
    queryFn: async () => {
      const { data } = await supabase
        .from("person_academic_qualifications")
        .select("id, achieved_date, evidence_url, is_current, academic_levels(name, score, description)")
        .eq("person_id", personId!);
      return data ?? [];
    },
  });

  return (
    <Card className="card-hover">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="h-4 w-4" /> Qualificação acadêmica
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Informação centralizada pelo RH — vale para todos os ciclos. Consulta apenas.
        </p>
      </CardHeader>
      <CardContent>
        {!data?.length ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma qualificação registrada.
          </div>
        ) : (
          <div className="space-y-2">
            {data.map((q: any) => (
              <div key={q.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    {q.academic_levels?.name}
                    {q.is_current && <Badge variant="secondary">Atual</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{q.academic_levels?.description ?? "—"}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{q.academic_levels?.score ?? "—"}</div>
                  {q.evidence_url && (
                    <a className="text-xs text-primary underline" href={q.evidence_url} target="_blank" rel="noreferrer">Evidência</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CertificationsView({ personId }: { personId: string | null }) {
  const { data } = useQuery({
    queryKey: ["view-certs", personId],
    enabled: !!personId,
    queryFn: async () => {
      const { data } = await supabase
        .from("person_certifications")
        .select("id, obtained, obtained_date, evidence_url, certifications_catalog(name, issuing_entity, bonus)")
        .eq("person_id", personId!);
      return data ?? [];
    },
  });

  const obtained = (data ?? []).filter((c: any) => c.obtained);

  return (
    <Card className="card-hover">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Award className="h-4 w-4" /> Certificações profissionais
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Informação centralizada pelo RH. Consulta apenas — clique em <strong>Concluir Avaliação</strong> para finalizar.
        </p>
      </CardHeader>
      <CardContent>
        {!obtained.length ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma certificação obtida registrada.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {obtained.map((c: any) => (
              <div key={c.id} className="rounded-lg border p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{c.certifications_catalog?.name}</div>
                  <div className="text-xs text-muted-foreground">{c.certifications_catalog?.issuing_entity ?? "—"}</div>
                </div>
                <Badge variant="secondary">+{c.certifications_catalog?.bonus ?? 0}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
