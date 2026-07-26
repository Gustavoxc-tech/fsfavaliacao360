import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Download, FileText } from "lucide-react";
import type {
  EvaluationCycle,
  VEvaluateeFinalResult,
  VAssignmentProgress,
  VCompetencyResult,
  VPersonFinalScore,
} from "@/lib/db-types";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [cycleId, setCycleId] = useState<string | undefined>();
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/" });
  }, [loading, isAdmin, navigate]);

  const { data: cycles } = useQuery({
    queryKey: ["cycles"],
    queryFn: async () => {
      const { data } = await supabase.from("evaluation_cycles").select("*").order("start_date", { ascending: false });
      return (data ?? []) as EvaluationCycle[];
    },
  });

  useEffect(() => {
    if (!cycleId && cycles && cycles.length > 0) setCycleId(cycles[0].id);
  }, [cycles, cycleId]);

  const { data: finals } = useQuery({
    queryKey: ["finals", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data } = await supabase.from("v_evaluatee_final_results").select("*").eq("cycle_id", cycleId);
      return (data ?? []) as VEvaluateeFinalResult[];
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["progress", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data } = await supabase.from("v_assignment_progress").select("*").eq("cycle_id", cycleId);
      return (data ?? []) as VAssignmentProgress[];
    },
  });

  const { data: overalls } = useQuery({
    queryKey: ["overalls", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data } = await supabase.from("v_person_final_score").select("*").eq("cycle_id", cycleId);
      return (data ?? []) as VPersonFinalScore[];
    },
  });

  const overallByEvaluatee = (id: string) => overalls?.find((o) => o.evaluatee_id === id);

  const completionByEvaluatee = (evaluateeId: string) => {
    const items = (progress ?? []).filter((p) => p.evaluatee_id === evaluateeId);
    if (items.length === 0) return 0;
    const sum = items.reduce((s, i) => s + i.pct_complete, 0);
    return Math.round(sum / items.length);
  };

  const exportCSV = async (final: VEvaluateeFinalResult) => {
    const o = overallByEvaluatee(final.evaluatee_id);
    const { data } = await supabase
      .from("v_competency_results")
      .select("*")
      .eq("evaluatee_id", final.evaluatee_id);
    const rows = (data ?? []) as VCompetencyResult[];
    const summary = [
      `"Resumo","Nota","Peso","Contribuição"`,
      `"Competências","${o?.competencies_score ?? ""}","${o?.competencies_weight ?? ""}","${o && o.competencies_score != null ? Number(o.competencies_score) * Number(o.competencies_weight) : ""}"`,
      `"Metas","${o?.goals_final_score ?? ""}","${o?.goals_weight ?? ""}","${o && o.goals_final_score != null ? Number(o.goals_final_score) * Number(o.goals_weight) : ""}"`,
      `"Qualificação","${o?.academic_final_score ?? ""}","${o?.academic_weight ?? ""}","${o && o.academic_final_score != null ? Number(o.academic_final_score) * Number(o.academic_weight) : ""}"`,
      `"Certificações","${o?.certification_final_score ?? ""}","${o?.certification_weight ?? ""}","${o && o.certification_final_score != null ? Number(o.certification_final_score) * Number(o.certification_weight) : ""}"`,

      `"Nota Final Geral","","","${o?.overall_final_score ?? ""}"`,
      "",
    ];
    const header = ["Dimensão", "Categoria", "Competência", "Gestor", "Pares", "Subordinados", "Auto", "Ponderado"];
    const lines = [
      ...summary,
      header.join(","),
      ...rows.map((r) =>
        [r.dimension, r.category, r.competency_name, r.gestor_score, r.pares_score, r.subordinados_score, r.autoavaliacao_score, r.weighted_result]
          .map((v) => `"${v ?? ""}"`)
          .join(",")
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, `avaliacao_${final.evaluatee_name.replace(/\s+/g, "_")}.csv`);
  };

  const exportPDF = async (final: VEvaluateeFinalResult) => {
    setExporting(final.evaluatee_id);
    const o = overallByEvaluatee(final.evaluatee_id);
    const { data } = await supabase
      .from("v_competency_results")
      .select("*")
      .eq("evaluatee_id", final.evaluatee_id)
      .order("display_order");
    const rows = (data ?? []) as VCompetencyResult[];

    const jsPDF = (await import("jspdf")).default;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Avaliação 360° — ${final.evaluatee_name}`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Nota Final Geral: ${o?.overall_final_score != null ? Number(o.overall_final_score).toFixed(2) : "—"}`, 14, 28);
    doc.text(`Competências: ${fmt(o?.competencies_score ?? final.final_result)}  |  Metas: ${fmt(o?.goals_score)}  |  Qualif.: ${fmt(o?.academic_score)}  |  Cert.: ${fmt(o?.certification_score)}`, 14, 34);

    let y = 46;
    doc.setFontSize(9);
    doc.text("Competência", 14, y);
    doc.text("Gestor", 110, y);
    doc.text("Pares", 130, y);
    doc.text("Sub", 150, y);
    doc.text("Auto", 165, y);
    doc.text("Pond", 185, y);
    y += 4;
    doc.line(14, y, 200, y);
    y += 5;

    for (const r of rows) {
      if (y > 280) { doc.addPage(); y = 20; }
      const name = r.competency_name.length > 50 ? r.competency_name.slice(0, 50) + "…" : r.competency_name;
      doc.text(name, 14, y);
      doc.text(String(r.gestor_score ?? "—"), 110, y);
      doc.text(String(r.pares_score ?? "—"), 130, y);
      doc.text(String(r.subordinados_score ?? "—"), 150, y);
      doc.text(String(r.autoavaliacao_score ?? "—"), 165, y);
      doc.text(String(r.weighted_result ?? "—"), 185, y);
      y += 6;
    }

    doc.save(`avaliacao_${final.evaluatee_name.replace(/\s+/g, "_")}.pdf`);
    setExporting(null);
  };

  return (
    <div className="space-y-6" ref={reportRef}>
      <div>
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Status de conclusão e resultados consolidados.</p>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Label>Ciclo:</Label>
            <Select value={cycleId} onValueChange={setCycleId}>
              <SelectTrigger className="w-[300px]"><SelectValue placeholder="Selecionar ciclo" /></SelectTrigger>
              <SelectContent>
                {cycles?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Avaliado</TableHead>
                <TableHead className="text-right">Gestor</TableHead>
                <TableHead className="text-right">Pares</TableHead>
                <TableHead className="text-right">Sub.</TableHead>
                <TableHead className="text-right">Auto</TableHead>
                <TableHead className="text-right">Compet.</TableHead>
                <TableHead className="text-right">Metas</TableHead>
                <TableHead className="text-right">Qualif.</TableHead>
                <TableHead className="text-right">Cert.</TableHead>
                <TableHead className="text-right">Final Geral</TableHead>
                <TableHead className="w-40">Conclusão</TableHead>
                <TableHead className="text-right">Exportar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {finals?.map((f) => {
                const pct = completionByEvaluatee(f.evaluatee_id);
                const o = overallByEvaluatee(f.evaluatee_id);
                return (
                  <TableRow key={f.evaluatee_id}>
                    <TableCell className="font-medium">{f.evaluatee_name}</TableCell>
                    <TableCell className="text-right">{fmt(f.gestor_avg)}</TableCell>
                    <TableCell className="text-right">{fmt(f.pares_avg)}</TableCell>
                    <TableCell className="text-right">{fmt(f.subordinados_avg)}</TableCell>
                    <TableCell className="text-right">{fmt(f.autoavaliacao_avg)}</TableCell>
                    <TableCell className="text-right">{fmt(f.final_result)}</TableCell>
                    <TableCell className="text-right">{fmt(o?.goals_score)}</TableCell>
                    <TableCell className="text-right">{fmt(o?.academic_score)}</TableCell>
                    <TableCell className="text-right">{fmt(o?.certification_score)}</TableCell>
                    <TableCell className="text-right font-bold text-primary">{fmt(o?.overall_final_score)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="flex-1" />
                        <span className="text-xs w-10 text-right">{pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" onClick={() => exportCSV(f)}>
                          <Download className="h-3 w-3 mr-1" /> CSV
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => exportPDF(f)} disabled={exporting === f.evaluatee_id}>
                          <FileText className="h-3 w-3 mr-1" /> PDF
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {finals?.length === 0 && (
                <TableRow><TableCell colSpan={13} className="text-center text-sm text-muted-foreground py-6">Sem dados neste ciclo.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function fmt(v: number | null | undefined) {
  return v == null ? "—" : Number(v).toFixed(2);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
