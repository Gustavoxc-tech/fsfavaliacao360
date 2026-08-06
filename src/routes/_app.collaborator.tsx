import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Users, Target } from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ScatterChart,
  Scatter,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import type {
  VCompetencyResult,
  VEvaluateeFinalResult,
  EvaluationCycle,
  Goal,
  GoalCategory,
  EvaluationWeightConfig,
  KnowledgeExam,
  KnowledgeExamWeightConfig,
} from "@/lib/db-types";
import { computeExamScore, weightedOverall, DEFAULT_BLOCK_WEIGHTS } from "@/lib/exam";


export const Route = createFileRoute("/_app/collaborator")({
  component: CollaboratorResults,
});

type TabKey = "dashboard" | "competencies" | "goals";

// Nine Box: divide os eixos (0 a 5) em 3 faixas iguais — Baixo / Médio / Alto
const NINE_BOX_T1 = 5 / 3; // ~1.67
const NINE_BOX_T2 = 10 / 3; // ~3.33
const NINE_BOX_CELLS = [
  // linha de cima (Atitudes alta)
  { x1: 0, x2: NINE_BOX_T1, y1: NINE_BOX_T2, y2: 5, fill: "#bfdbfe", label: "Potencial" },
  { x1: NINE_BOX_T1, x2: NINE_BOX_T2, y1: NINE_BOX_T2, y2: 5, fill: "#a7f3d0", label: "Em ascensão" },
  { x1: NINE_BOX_T2, x2: 5, y1: NINE_BOX_T2, y2: 5, fill: "#86efac", label: "Alto desempenho" },
  // linha do meio
  { x1: 0, x2: NINE_BOX_T1, y1: NINE_BOX_T1, y2: NINE_BOX_T2, fill: "#fed7aa", label: "Desenvolver" },
  { x1: NINE_BOX_T1, x2: NINE_BOX_T2, y1: NINE_BOX_T1, y2: NINE_BOX_T2, fill: "#e2e8f0", label: "Consistente" },
  { x1: NINE_BOX_T2, x2: 5, y1: NINE_BOX_T1, y2: NINE_BOX_T2, fill: "#d9f99d", label: "Técnico forte" },
  // linha de baixo (Atitudes baixa)
  { x1: 0, x2: NINE_BOX_T1, y1: 0, y2: NINE_BOX_T1, fill: "#fecaca", label: "Zona de risco" },
  { x1: NINE_BOX_T1, x2: NINE_BOX_T2, y1: 0, y2: NINE_BOX_T1, fill: "#fde68a", label: "Atenção" },
  { x1: NINE_BOX_T2, x2: 5, y1: 0, y2: NINE_BOX_T1, fill: "#fef08a", label: "Foco em atitudes" },
] as const;

function CollaboratorResults() {
  const { person } = useAuth();
  const [tab, setTab] = useState<TabKey>("dashboard");

  const { data: cycles } = useQuery({
    queryKey: ["cycles-with-me", person?.id],
    enabled: !!person?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_evaluatee_final_results")
        .select("cycle_id")
        .eq("evaluatee_person_id", person!.id);
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((r: any) => r.cycle_id))];
      if (ids.length === 0) return [];
      const { data: cs } = await supabase.from("evaluation_cycles").select("*").in("id", ids);
      return (cs ?? []) as EvaluationCycle[];
    },
  });

  const [cycleId, setCycleId] = useState<string | undefined>();
  const effective = cycleId ?? cycles?.[0]?.id;

  const { data: final } = useQuery({
    queryKey: ["final", person?.id, effective],
    enabled: !!person?.id && !!effective,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_evaluatee_final_results")
        .select("*")
        .eq("evaluatee_person_id", person!.id)
        .eq("cycle_id", effective)
        .maybeSingle();
      if (error) throw error;
      return data as VEvaluateeFinalResult | null;
    },
  });

  const { data: byComp } = useQuery({
    queryKey: ["by-comp", person?.id, effective],
    enabled: !!person?.id && !!effective,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_competency_results")
        .select("*")
        .eq("evaluatee_person_id", person!.id)
        .eq("cycle_id", effective)
        .order("display_order");
      if (error) throw error;
      return data as VCompetencyResult[];
    },
  });

  // evaluatee_id (necessário para consultar metas) vem da própria view de resultado final
  const evaluateeId = final?.evaluatee_id;

  const { data: goals } = useQuery({
    queryKey: ["my-goals", evaluateeId, effective],
    enabled: !!evaluateeId && !!effective,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goals")
        .select("*")
        .eq("evaluatee_id", evaluateeId)
        .eq("cycle_id", effective);
      if (error) throw error;
      return (data ?? []) as Goal[];
    },
  });

  const { data: goalCategories } = useQuery({
    queryKey: ["my-goal-categories", effective],
    enabled: !!effective,
    queryFn: async () => {
      const { data, error } = await supabase.from("goal_categories").select("*").eq("cycle_id", effective);
      if (error) throw error;
      return (data ?? []) as GoalCategory[];
    },
  });

  // Peso de cada bloco no resultado geral (usa os padrões do sistema se o ciclo
  // não tiver uma configuração própria: 60% competências / 20% metas / 10% prova / 5% / 5%)
  const { data: weightConfig } = useQuery({
    queryKey: ["my-weight-config", effective],
    enabled: !!effective,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluation_weight_config")
        .select("*")
        .eq("cycle_id", effective)
        .maybeSingle();
      if (error) throw error;
      return data as EvaluationWeightConfig | null;
    },
  });
  const competenciesWeight = weightConfig ? Number(weightConfig.competencies_weight) : DEFAULT_BLOCK_WEIGHTS.competencies;
  const goalsWeight = weightConfig ? Number(weightConfig.goals_weight) : DEFAULT_BLOCK_WEIGHTS.goals;
  const academicWeight = weightConfig ? Number(weightConfig.academic_weight) : DEFAULT_BLOCK_WEIGHTS.academic;
  const certificationWeight = weightConfig ? Number(weightConfig.certification_weight) : DEFAULT_BLOCK_WEIGHTS.certification;
  const examWeight =
    weightConfig?.knowledge_exam_weight != null
      ? Number(weightConfig.knowledge_exam_weight)
      : DEFAULT_BLOCK_WEIGHTS.knowledgeExam;

  // Prova de Conhecimentos (lançada pelo Admin; o colaborador apenas visualiza)
  const { data: exam } = useQuery({
    queryKey: ["my-exam", person?.id, effective],
    enabled: !!person?.id && !!effective,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_exams")
        .select("*")
        .eq("person_id", person!.id)
        .eq("cycle_id", effective)
        .maybeSingle();
      if (error) throw error;
      return data as KnowledgeExam | null;
    },
  });

  const { data: examWeights } = useQuery({
    queryKey: ["my-exam-subweights", effective],
    enabled: !!effective,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_exam_weight_config")
        .select("*")
        .eq("cycle_id", effective)
        .maybeSingle();
      if (error) throw error;
      return data as KnowledgeExamWeightConfig | null;
    },
  });

  const examScore = useMemo(() => computeExamScore(exam, examWeights), [exam, examWeights]);


  // Nota de qualificação acadêmica: maior nível "atual" cadastrado para a pessoa
  const { data: academicScore } = useQuery({
    queryKey: ["my-academic-score", person?.id],
    enabled: !!person?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("person_academic_qualifications")
        .select("is_current, academic_levels(score)")
        .eq("person_id", person!.id)
        .eq("is_current", true);
      if (error) throw error;
      const scores = (data ?? [])
        .map((r: any) => r.academic_levels?.score)
        .filter((s: any) => s != null)
        .map(Number);
      return scores.length ? Math.max(...scores) : null;
    },
  });

  // Nota de certificações: soma dos bônus das certificações marcadas como obtidas
  const { data: certificationScore } = useQuery({
    queryKey: ["my-certification-score", person?.id],
    enabled: !!person?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("person_certifications")
        .select("obtained, certifications_catalog(bonus)")
        .eq("person_id", person!.id)
        .eq("obtained", true);
      if (error) throw error;
      if (!data || data.length === 0) return null;
      return data.reduce((sum: number, r: any) => sum + Number(r.certifications_catalog?.bonus ?? 0), 0);
    },
  });

  const radarData = (byComp ?? []).map((r) => ({
    competency: r.competency_name,
    nota: r.weighted_result ?? 0,
  }));

  const dimensionData = useMemo(() => {
    const g: Record<string, { total: number; count: number }> = {};
    for (const r of byComp ?? []) {
      if (r.weighted_result == null) continue;
      if (!g[r.dimension]) g[r.dimension] = { total: 0, count: 0 };
      g[r.dimension].total += Number(r.weighted_result);
      g[r.dimension].count += 1;
    }
    return Object.entries(g).map(([dimension, x]) => ({
      dimension,
      nota: x.count ? x.total / x.count : 0,
    }));
  }, [byComp]);

  const scatterData = useMemo(() => {
    let atitudes = 0;
    let habilidades = 0;
    for (const d of dimensionData) {
      const dim = d.dimension.toLowerCase();
      if (dim.includes("atitude")) atitudes = d.nota;
      if (dim.includes("habilidade")) habilidades = d.nota;
    }
    return [{ name: "Avaliado", atitudes, habilidades }];
  }, [dimensionData]);

  // Metas: calculado direto de goals + goal_categories (tabelas simples, sem
  // depender de nenhuma view), no mesmo critério usado no restante do sistema:
  // % de alcance = obtido / esperado, ponderado pelo peso de cada categoria.
  const goalsByCategory = useMemo(() => {
    return (goalCategories ?? [])
      .map((cat) => {
        const items = (goals ?? []).filter((g) => g.category_id === cat.id);
        const expectedSum = items.reduce((s, g) => s + Number(g.expected_score || 0), 0);
        const obtainedSum = items.reduce((s, g) => s + Number(g.obtained_score ?? 0), 0);
        const pctAlcance = expectedSum > 0 ? obtainedSum / expectedSum : null;
        const weightedResult = pctAlcance != null ? pctAlcance * Number(cat.weight) : null;
        return { cat, items, pctAlcance, weightedResult };
      })
      .filter((g) => g.items.length > 0);
  }, [goalCategories, goals]);

  const goalsFinalScore = useMemo(() => {
    const withData = goalsByCategory.filter((g) => g.weightedResult != null);
    if (withData.length === 0) return null;
    const sumWeighted = withData.reduce((s, g) => s + (g.weightedResult ?? 0), 0);
    const sumWeight = withData.reduce((s, g) => s + Number(g.cat.weight), 0);
    return sumWeight > 0 ? (sumWeighted / sumWeight) * 5 : null;
  }, [goalsByCategory]);

  // Resultado consolidado final, ponderando apenas os blocos que já têm nota
  const competenciesScore = final?.final_result ?? null;
  const overallFinalScore = useMemo(() => {
    const parts = [
      { score: competenciesScore, weight: competenciesWeight },
      { score: goalsFinalScore, weight: goalsWeight },
      { score: academicScore ?? null, weight: academicWeight },
      { score: certificationScore ?? null, weight: certificationWeight },
    ];
    const totalWeight = parts.reduce((s, p) => s + (p.score != null ? p.weight : 0), 0);
    if (totalWeight <= 0) return null;
    const totalWeighted = parts.reduce((s, p) => s + (p.score != null ? p.score * p.weight : 0), 0);
    return totalWeighted / totalWeight;
  }, [competenciesScore, competenciesWeight, goalsFinalScore, goalsWeight, academicScore, academicWeight, certificationScore, certificationWeight]);

  const radialData = [{ name: "Final", value: overallFinalScore ?? 0, fill: "var(--primary)" }];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Meus Resultados</h1>
          <p className="text-sm text-muted-foreground">Seus resultados consolidados: avaliação 360°, metas e visão geral.</p>
        </div>
        {cycles && cycles.length > 0 && (
          <Select value={effective} onValueChange={setCycleId}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Selecionar ciclo" /></SelectTrigger>
            <SelectContent>
              {cycles.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {(!cycles || cycles.length === 0) && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Você ainda não foi avaliado em nenhum ciclo.
        </CardContent></Card>
      )}

      {final && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="grid w-full grid-cols-3" data-tour="results-tabs">
            <TabsTrigger value="dashboard"><LayoutDashboard className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
            <TabsTrigger value="competencies"><Users className="h-4 w-4 mr-1" />Avaliação 360°</TabsTrigger>
            <TabsTrigger value="goals"><Target className="h-4 w-4 mr-1" />Metas</TabsTrigger>
          </TabsList>

          {/* ----------------- DASHBOARD CONSOLIDADO ----------------- */}
          <TabsContent value="dashboard" className="mt-4 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="card-hover">
                <CardHeader><CardTitle>Nota Final Geral</CardTitle></CardHeader>
                <CardContent>
                  <div className="relative h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart innerRadius="70%" outerRadius="100%" data={radialData} startAngle={90} endAngle={-270}>
                        <PolarAngleAxis type="number" domain={[0, 5]} angleAxisId={0} tick={false} />
                        <RadialBar background={{ fill: "var(--muted)" }} dataKey="value" cornerRadius={10} isAnimationActive animationDuration={900} />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="text-center">
                        <div className="text-4xl font-bold text-primary">{fmt(overallFinalScore)}</div>
                        <div className="text-xs text-muted-foreground">de 5,00</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <MiniStat label="Competências" v={competenciesScore} w={competenciesWeight} />
                    <MiniStat label="Metas" v={goalsFinalScore} w={goalsWeight} />
                    <MiniStat label="Qualificação" v={academicScore ?? null} w={academicWeight} />
                    <MiniStat label="Certificação" v={certificationScore ?? null} w={certificationWeight} />
                  </div>
                </CardContent>
              </Card>

              <Card className="card-hover">
                <CardHeader><CardTitle>Atitudes vs Habilidades (Nine Box)</CardTitle></CardHeader>
                <CardContent>
                  {dimensionData.length > 0 ? (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 10, right: 15, bottom: 30, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis
                            type="number"
                            dataKey="habilidades"
                            name="Habilidades"
                            domain={[0, 5]}
                            tickCount={6}
                            tick={{ fontSize: 10 }}
                            label={{ value: "Habilidades", position: "insideBottom", offset: -10, fontSize: 12, fill: "var(--foreground)" }}
                          />
                          <YAxis
                            type="number"
                            dataKey="atitudes"
                            name="Atitudes"
                            domain={[0, 5]}
                            tickCount={6}
                            tick={{ fontSize: 10 }}
                            label={{ value: "Atitudes", angle: -90, position: "insideLeft", offset: 5, fontSize: 12, fill: "var(--foreground)" }}
                          />
                          <Tooltip
                            cursor={{ strokeDasharray: "3 3" }}
                            formatter={(value: number, name: string) => [Number(value).toFixed(2), name]}
                            contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                          />
                          {NINE_BOX_CELLS.map((cell) => (
                            <ReferenceArea
                              key={cell.label}
                              x1={cell.x1} x2={cell.x2} y1={cell.y1} y2={cell.y2}
                              fill={cell.fill} fillOpacity={0.5}
                              label={{ value: cell.label, position: "center", fontSize: 8.5, fill: "#334155" }}
                            />
                          ))}
                          <ReferenceLine x={NINE_BOX_T1} stroke="var(--muted-foreground)" opacity={0.4} />
                          <ReferenceLine x={NINE_BOX_T2} stroke="var(--muted-foreground)" opacity={0.4} />
                          <ReferenceLine y={NINE_BOX_T1} stroke="var(--muted-foreground)" opacity={0.4} />
                          <ReferenceLine y={NINE_BOX_T2} stroke="var(--muted-foreground)" opacity={0.4} />
                          <Scatter name="Avaliado" data={scatterData} fill="var(--primary)" shape="circle" r={9} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 grid place-items-center text-sm text-muted-foreground">Ainda sem dados neste ciclo.</div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="card-hover">
              <CardHeader><CardTitle>Resumo Geral Ponderado</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bloco</TableHead>
                      <TableHead className="text-right">Nota</TableHead>
                      <TableHead className="text-right">Peso</TableHead>
                      <TableHead className="text-right">Contribuição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <SummaryRow label="Competências" score={competenciesScore} weight={competenciesWeight} />
                    <SummaryRow label="Metas" score={goalsFinalScore} weight={goalsWeight} />
                    <SummaryRow label="Qualificação Acadêmica" score={academicScore ?? null} weight={academicWeight} />
                    <SummaryRow label="Certificações" score={certificationScore ?? null} weight={certificationWeight} />
                    <TableRow className="border-t-2">
                      <TableCell className="font-bold">Nota Final Geral</TableCell>
                      <TableCell colSpan={2}></TableCell>
                      <TableCell className="text-right font-bold text-lg text-primary">{fmt(overallFinalScore)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ----------------- AVALIAÇÃO 360° ----------------- */}
          <TabsContent value="competencies" className="mt-4 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KPI label="Resultado 360°" value={final.final_result} highlight />
              <KPI label="Gestor" value={final.gestor_avg} />
              <KPI label="Pares" value={final.pares_avg} />
              <KPI label="Subordinados" value={final.subordinados_avg} />
              <KPI label="Autoavaliação" value={final.autoavaliacao_avg} />
            </div>

            <Card className="card-hover">
              <CardHeader><CardTitle>Visão por Competência</CardTitle></CardHeader>
              <CardContent style={{ height: 420 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="competency" tick={{ fontSize: 10 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 5]} />
                    <Radar name="Nota Ponderada" dataKey="nota" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.4} isAnimationActive animationDuration={800} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="card-hover">
              <CardHeader><CardTitle>Comparativo por Tipo de Avaliador</CardTitle></CardHeader>
              <CardContent style={{ height: 420 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byComp ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="competency_name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={100} />
                    <YAxis domain={[0, 5]} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="gestor_score" fill="var(--chart-1)" name="Gestor" />
                    <Bar dataKey="pares_score" fill="var(--chart-2)" name="Pares" />
                    <Bar dataKey="subordinados_score" fill="var(--chart-3)" name="Subordinados" />
                    <Bar dataKey="autoavaliacao_score" fill="var(--chart-4)" name="Auto" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Tabela Detalhada</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Competência</TableHead>
                      <TableHead className="text-right">Gestor</TableHead>
                      <TableHead className="text-right">Pares</TableHead>
                      <TableHead className="text-right">Subordinados</TableHead>
                      <TableHead className="text-right">Auto</TableHead>
                      <TableHead className="text-right font-bold">Ponderado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byComp?.map((r) => (
                      <TableRow key={r.competency_id}>
                        <TableCell>{r.competency_name}</TableCell>
                        <TableCell className="text-right">{fmt(r.gestor_score)}</TableCell>
                        <TableCell className="text-right">{fmt(r.pares_score)}</TableCell>
                        <TableCell className="text-right">{fmt(r.subordinados_score)}</TableCell>
                        <TableCell className="text-right">{fmt(r.autoavaliacao_score)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(r.weighted_result)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ----------------- METAS ----------------- */}
          <TabsContent value="goals" className="mt-4 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <KPI label="Resultado de Metas" value={goalsFinalScore} highlight />
              <KPI label="Peso no Resultado Geral" value={goalsWeight * 5} />
            </div>

            {goalsByCategory.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma meta cadastrada para você neste ciclo.
                </CardContent>
              </Card>
            ) : (
              goalsByCategory.map(({ cat, items, pctAlcance, weightedResult }) => (
                <Card key={cat.id} className="card-hover">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{cat.name}</CardTitle>
                    <div className="text-right text-sm">
                      <div className="text-muted-foreground">% de alcance</div>
                      <div className="font-bold text-primary">
                        {pctAlcance != null ? `${(pctAlcance * 100).toFixed(0)}%` : "—"}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Meta</TableHead>
                          <TableHead className="text-right">Esperado</TableHead>
                          <TableHead className="text-right">Obtido</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((g) => (
                          <TableRow key={g.id}>
                            <TableCell>{g.description}</TableCell>
                            <TableCell className="text-right">{fmt(g.expected_score)}</TableCell>
                            <TableCell className="text-right">{fmt(g.obtained_score)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2">
                          <TableCell className="font-bold">Ponderado da categoria</TableCell>
                          <TableCell colSpan={1}></TableCell>
                          <TableCell className="text-right font-bold text-primary">{fmt(weightedResult)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function KPI({ label, value, highlight }: { label: string; value: number | null; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary" : undefined}>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${highlight ? "text-primary" : ""}`}>{fmt(value)}</div>
      </CardContent>
    </Card>
  );
}

function fmt(v: number | null | undefined) {
  return v == null ? "—" : Number(v).toFixed(2);
}

function SummaryRow({ label, score, weight }: { label: string; score: number | null; weight: number }) {
  const contribution = score != null ? Number(score) * Number(weight) : null;
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="text-right">{fmt(score)}</TableCell>
      <TableCell className="text-right">{(Number(weight) * 100).toFixed(0)}%</TableCell>
      <TableCell className="text-right">{fmt(contribution)}</TableCell>
    </TableRow>
  );
}

function MiniStat({ label, v, w }: { label: string; v: number | null; w: number }) {
  return (
    <div className="rounded-md bg-secondary/60 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label} · {(Number(w) * 100).toFixed(0)}%</div>
      <div className="text-base font-semibold text-foreground">{fmt(v)}</div>
    </div>
  );
}
