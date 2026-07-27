import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
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
} from "recharts";
import { useMemo } from "react";
import type { VCompetencyResult, VEvaluateeFinalResult, EvaluationCycle, VPersonFinalScore } from "@/lib/db-types";

export const Route = createFileRoute("/_app/collaborator")({
  component: CollaboratorResults,
});

function CollaboratorResults() {
  const { person } = useAuth();

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

  const { data: overall } = useQuery({
    queryKey: ["overall", person?.id, effective],
    enabled: !!person?.id && !!effective,
    queryFn: async () => {
      const { data } = await supabase
        .from("v_person_final_score")
        .select("*")
        .eq("evaluatee_person_id", person!.id)
        .eq("cycle_id", effective)
        .maybeSingle();
      return data as VPersonFinalScore | null;
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

  const radialData = [{ name: "Final", value: overall?.overall_final_score ?? 0, fill: "var(--primary)" }];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Meus Resultados</h1>
          <p className="text-sm text-muted-foreground">Seus resultados consolidados de avaliação 360°.</p>
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
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPI label="Resultado 360°" value={final.final_result} highlight />
            <KPI label="Gestor" value={final.gestor_avg} />
            <KPI label="Pares" value={final.pares_avg} />
            <KPI label="Subordinados" value={final.subordinados_avg} />
            <KPI label="Autoavaliação" value={final.autoavaliacao_avg} />
          </div>

          {overall && (
            <Card>
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
                    <SummaryRow label="Competências" score={overall.competencies_score} weight={overall.competencies_weight} />
                    <SummaryRow label="Metas" score={overall.goals_final_score} weight={overall.goals_weight} />
                    <SummaryRow label="Qualificação Acadêmica" score={overall.academic_final_score} weight={overall.academic_weight} />
                    <SummaryRow label="Certificações" score={overall.certification_final_score} weight={overall.certification_weight} />
                    <TableRow className="border-t-2">
                      <TableCell className="font-bold">Nota Final Geral</TableCell>
                      <TableCell colSpan={2}></TableCell>
                      <TableCell className="text-right font-bold text-lg text-primary">{fmt(overall.overall_final_score)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Visão por Competência</CardTitle></CardHeader>
            <CardContent style={{ height: 420 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="competency" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} />
                  <Radar name="Nota Ponderada" dataKey="nota" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.4} />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Comparativo por Tipo de Avaliador</CardTitle></CardHeader>
            <CardContent style={{ height: 420 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byComp ?? []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="competency_name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={100} />
                  <YAxis domain={[0, 5]} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="gestor_score" fill="#3b82f6" name="Gestor" />
                  <Bar dataKey="pares_score" fill="#10b981" name="Pares" />
                  <Bar dataKey="subordinados_score" fill="#f59e0b" name="Subordinados" />
                  <Bar dataKey="autoavaliacao_score" fill="#a855f7" name="Auto" />
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
        </>
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
