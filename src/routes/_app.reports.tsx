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
import { Download, FileText, Loader2 } from "lucide-react";
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

  // --- EXPORTAÇÃO EXECUTIVA PARA EXCEL (XLS HTML) ---
  const exportCSV = async (final: VEvaluateeFinalResult) => {
    const o = overallByEvaluatee(final.evaluatee_id);
    const { data } = await supabase
      .from("v_competency_results")
      .select("*")
      .eq("evaluatee_id", final.evaluatee_id)
      .order("display_order");
    const rows = (data ?? []) as VCompetencyResult[];

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; }
          .header { background-color: #1e3a8a; color: white; font-size: 24px; font-weight: bold; padding: 15px; text-align: center; }
          .section-title { background-color: #3b82f6; color: white; font-size: 16px; font-weight: bold; padding: 10px; margin-top: 20px; }
          .table { border-collapse: collapse; width: 100%; margin-top: 10px; }
          .table th { background-color: #f1f5f9; color: #0f172a; font-weight: bold; border: 1px solid #cbd5e1; padding: 8px; text-align: center; }
          .table td { border: 1px solid #cbd5e1; padding: 8px; text-align: center; }
          .methodology { background-color: #f8fafc; padding: 15px; border-left: 4px solid #3b82f6; margin-top: 20px; font-size: 12px; color: #334155; }
        </style>
      </head>
      <body>
        <table>
          <tr><td colspan="8" class="header">Relatório Executivo de Avaliação 360° - ${final.evaluatee_name}</td></tr>
          
          <tr><td colspan="8" class="section-title">Resumo de Desempenho</td></tr>
          <tr>
            <th colspan="2">Dimensão</th>
            <th colspan="2">Nota Obtida</th>
            <th colspan="2">Peso (%)</th>
            <th colspan="2">Contribuição Final</th>
          </tr>
          <tr><td colspan="2">Competências</td><td colspan="2">${o?.competencies_score ?? "-"}</td><td colspan="2">${o?.competencies_weight ?? "-"}</td><td colspan="2">${o && o.competencies_score != null ? (Number(o.competencies_score) * Number(o.competencies_weight)).toFixed(2) : "-"}</td></tr>
          <tr><td colspan="2">Metas</td><td colspan="2">${o?.goals_final_score ?? "-"}</td><td colspan="2">${o?.goals_weight ?? "-"}</td><td colspan="2">${o && o.goals_final_score != null ? (Number(o.goals_final_score) * Number(o.goals_weight)).toFixed(2) : "-"}</td></tr>
          <tr><td colspan="2">Qualificação</td><td colspan="2">${o?.academic_final_score ?? "-"}</td><td colspan="2">${o?.academic_weight ?? "-"}</td><td colspan="2">${o && o.academic_final_score != null ? (Number(o.academic_final_score) * Number(o.academic_weight)).toFixed(2) : "-"}</td></tr>
          <tr><td colspan="2">Certificações</td><td colspan="2">${o?.certification_final_score ?? "-"}</td><td colspan="2">${o?.certification_weight ?? "-"}</td><td colspan="2">${o && o.certification_final_score != null ? (Number(o.certification_final_score) * Number(o.certification_weight)).toFixed(2) : "-"}</td></tr>
          <tr><th colspan="6" style="text-align: right; font-size: 14px;">NOTA FINAL GERAL</th><th colspan="2" style="font-size: 14px; background-color: #dbeafe; color: #1e3a8a;">${o?.overall_final_score != null ? Number(o.overall_final_score).toFixed(2) : "-"}</th></tr>

          <tr><td colspan="8"></td></tr>
          <tr><td colspan="8" class="section-title">Detalhamento por Competência</td></tr>
          <tr>
            <th>Dimensão</th>
            <th>Categoria</th>
            <th>Competência</th>
            <th>Gestor</th>
            <th>Pares</th>
            <th>Subordinados</th>
            <th>Autoavaliação</th>
            <th>Nota Ponderada</th>
          </tr>
          ${rows.map(r => `
            <tr>
              <td>${r.dimension ?? "-"}</td>
              <td>${r.category ?? "-"}</td>
              <td style="text-align: left;">${r.competency_name ?? "-"}</td>
              <td>${r.gestor_score ?? "-"}</td>
              <td>${r.pares_score ?? "-"}</td>
              <td>${r.subordinados_score ?? "-"}</td>
              <td>${r.autoavaliacao_score ?? "-"}</td>
              <td style="background-color: #f1f5f9; font-weight: bold;">${r.weighted_result ?? "-"}</td>
            </tr>
          `).join('')}
          
          <tr><td colspan="8"></td></tr>
          <tr><td colspan="8" class="section-title">Metodologia de Cálculo</td></tr>
          <tr><td colspan="8" class="methodology" style="text-align: left;">
            <b>1. Contribuição Final por Dimensão:</b> Calculada multiplicando a "Nota Obtida" pelo "Peso" definido para aquela dimensão.<br/>
            <b>2. Nota Final Geral:</b> É a soma das contribuições finais de todas as dimensões avaliadas (Competências, Metas, Qualificação e Certificações).<br/>
            <b>3. Nota Ponderada por Competência:</b> Calculada com base na média ponderada das avaliações recebidas de cada grupo (Gestor, Pares, Subordinados, Autoavaliação), conforme os pesos configurados no sistema.
          </td></tr>
        </table>
      </body>
      </html>
    `;
    
    const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Relatorio_Executivo_${final.evaluatee_name.replace(/\s+/g, '_')}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- EXPORTAÇÃO EXECUTIVA PARA PDF (VISUAL) ---
  const exportPDF = async (final: VEvaluateeFinalResult) => {
    setExporting(final.evaluatee_id);
    try {
      const o = overallByEvaluatee(final.evaluatee_id);
      const { data } = await supabase
        .from("v_competency_results")
        .select("*")
        .eq("evaluatee_id", final.evaluatee_id)
        .order("display_order");
      const rows = (data ?? []) as VCompetencyResult[];

      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "800px";
      container.style.backgroundColor = "white";
      container.style.padding = "40px";
      container.style.fontFamily = "'Inter', sans-serif";
      container.style.color = "#1e293b";

      container.innerHTML = `
        <div style="border-bottom: 4px solid #2563eb; padding-bottom: 15px; margin-bottom: 30px;">
          <h1 style="font-size: 28px; color: #1e3a8a; margin: 0;">Relatório Executivo de Avaliação 360°</h1>
          <p style="font-size: 18px; color: #64748b; margin: 5px 0 0 0;">Colaborador: <span style="color: #0f172a; font-weight: 600;">${final.evaluatee_name}</span></p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
          <h2 style="font-size: 18px; color: #334155; margin-top: 0; margin-bottom: 15px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px;">Resumo de Desempenho</h2>
          
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background-color: #e2e8f0; color: #475569;">
                <th style="padding: 10px; text-align: left;">Dimensão</th>
                <th style="padding: 10px; text-align: center;">Nota Obtida</th>
                <th style="padding: 10px; text-align: center;">Peso</th>
                <th style="padding: 10px; text-align: right;">Contribuição Final</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px; font-weight: 500;">Competências</td>
                <td style="padding: 10px; text-align: center;">${o?.competencies_score ?? "-"}</td>
                <td style="padding: 10px; text-align: center;">${o?.competencies_weight ? o.competencies_weight + '%' : "-"}</td>
                <td style="padding: 10px; text-align: right; font-weight: 600;">${o && o.competencies_score != null ? (Number(o.competencies_score) * Number(o.competencies_weight)).toFixed(2) : "-"}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px; font-weight: 500;">Metas</td>
                <td style="padding: 10px; text-align: center;">${o?.goals_final_score ?? "-"}</td>
                <td style="padding: 10px; text-align: center;">${o?.goals_weight ? o.goals_weight + '%' : "-"}</td>
                <td style="padding: 10px; text-align: right; font-weight: 600;">${o && o.goals_final_score != null ? (Number(o.goals_final_score) * Number(o.goals_weight)).toFixed(2) : "-"}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px; font-weight: 500;">Qualificação</td>
                <td style="padding: 10px; text-align: center;">${o?.academic_final_score ?? "-"}</td>
                <td style="padding: 10px; text-align: center;">${o?.academic_weight ? o.academic_weight + '%' : "-"}</td>
                <td style="padding: 10px; text-align: right; font-weight: 600;">${o && o.academic_final_score != null ? (Number(o.academic_final_score) * Number(o.academic_weight)).toFixed(2) : "-"}</td>
              </tr>
              <tr style="border-bottom: 1px solid #cbd5e1;">
                <td style="padding: 10px; font-weight: 500;">Certificações</td>
                <td style="padding: 10px; text-align: center;">${o?.certification_final_score ?? "-"}</td>
                <td style="padding: 10px; text-align: center;">${o?.certification_weight ? o.certification_weight + '%' : "-"}</td>
                <td style="padding: 10px; text-align: right; font-weight: 600;">${o && o.certification_final_score != null ? (Number(o.certification_final_score) * Number(o.certification_weight)).toFixed(2) : "-"}</td>
              </tr>
              <tr style="background-color: #dbeafe; color: #1e3a8a;">
                <td colspan="3" style="padding: 12px 10px; font-weight: bold; text-align: right; font-size: 16px;">NOTA FINAL GERAL</td>
                <td style="padding: 12px 10px; font-weight: bold; text-align: right; font-size: 18px;">${o?.overall_final_score != null ? Number(o.overall_final_score).toFixed(2) : "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 style="font-size: 18px; color: #334155; margin-bottom: 15px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px;">Detalhamento por Competência</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #1e293b; color: white;">
              <th style="padding: 8px; text-align: left;">Competência</th>
              <th style="padding: 8px; text-align: center;">Gestor</th>
              <th style="padding: 8px; text-align: center;">Pares</th>
              <th style="padding: 8px; text-align: center;">Sub</th>
              <th style="padding: 8px; text-align: center;">Auto</th>
              <th style="padding: 8px; text-align: center; background-color: #0f172a;">Pond.</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr style="background-color: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px; color: #334155;">${r.competency_name.length > 50 ? r.competency_name.slice(0, 50) + "..." : r.competency_name}</td>
                <td style="padding: 8px; text-align: center;">${r.gestor_score ?? "-"}</td>
                <td style="padding: 8px; text-align: center;">${r.pares_score ?? "-"}</td>
                <td style="padding: 8px; text-align: center;">${r.subordinados_score ?? "-"}</td>
                <td style="padding: 8px; text-align: center;">${r.autoavaliacao_score ?? "-"}</td>
                <td style="padding: 8px; text-align: center; font-weight: bold; color: #0f172a; background-color: ${i % 2 === 0 ? '#f1f5f9' : '#e2e8f0'};">${r.weighted_result ?? "-"}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 0 8px 8px 0;">
          <h3 style="margin-top: 0; color: #1e3a8a; font-size: 14px; margin-bottom: 8px;">Metodologia de Cálculo Utilizada</h3>
          <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #475569; line-height: 1.6;">
            <li><b>Contribuição Final:</b> Obtida através da multiplicação da Nota pelo respectivo Peso da dimensão.</li>
            <li><b>Nota Final Geral:</b> Representa a soma exata de todas as contribuições finais das dimensões avaliadas.</li>
            <li><b>Nota Ponderada (Pond.):</b> Média das avaliações da competência considerando os pesos atribuídos aos diferentes tipos de avaliadores (Gestor, Pares, Subordinados, Autoavaliação).</li>
          </ul>
        </div>
      `;

      document.body.appendChild(container);

      // Usando bibliotecas que já estão no seu projeto!
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      if (pdfHeight > pdf.internal.pageSize.getHeight()) {
         let heightLeft = pdfHeight;
         let position = 0;
         const pageHeight = pdf.internal.pageSize.getHeight();
         
         pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
         heightLeft -= pageHeight;
         
         while (heightLeft >= 0) {
           position = heightLeft - pdfHeight;
           pdf.addPage();
           pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
           heightLeft -= pageHeight;
         }
      } else {
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      }

      pdf.save(`Relatorio_Executivo_${final.evaluatee_name.replace(/\s+/g, "_")}.pdf`);
      document.body.removeChild(container);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6" ref={reportRef}>
      <div>
        <h1 className="text-2xl font-bold">Relatórios Executivos</h1>
        <p className="text-sm text-muted-foreground">Status de conclusão e resultados consolidados para a Diretoria.</p>
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
                    <TableCell className="text-right">{fmt(o?.goals_final_score)}</TableCell>
                    <TableCell className="text-right">{fmt(o?.academic_final_score)}</TableCell>
                    <TableCell className="text-right">{fmt(o?.certification_final_score)}</TableCell>
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
                          <Download className="h-3 w-3 mr-1" /> XLS
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => exportPDF(f)} disabled={exporting === f.evaluatee_id}>
                          {exporting === f.evaluatee_id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileText className="h-3 w-3 mr-1" />} PDF
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {finals?.length === 0 && (
                <TableRow><TableCell colSpan={12} className="text-center text-sm text-muted-foreground py-6">Sem dados neste ciclo.</TableCell></TableRow>
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
