import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import type {
  EvaluationCycle,
  VEvaluateeFinalResult,
  VAssignmentProgress,
  VCompetencyResult,
  Goal,
  GoalCategory,
  EvaluationWeightConfig,
  KnowledgeExam,
  KnowledgeExamWeightConfig,
} from "@/lib/db-types";
import { computeExamScore, weightedOverall, DEFAULT_BLOCK_WEIGHTS } from "@/lib/exam";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

// Cores do design system (mesmas do styles.css) usadas nos exports
const BRAND = {
  primaryHex: "0E3A45",
  primaryRgb: [14, 58, 69] as [number, number, number],
  accentHex: "1F8A70",
  accentRgb: [31, 138, 112] as [number, number, number],
  lightBg: "F6FAFC",
  grayText: [90, 100, 105] as [number, number, number],
};

const METHOD_TEXT = {
  competencies:
    "Cada competência é avaliada de 0 a 5 por até 4 tipos de avaliador (Gestor, Pares, Subordinados e " +
    "Autoavaliação). A nota da competência é a média das notas dadas pelos avaliadores que efetivamente " +
    "avaliaram, ponderada pelo peso de cada tipo de avaliador. O resultado de Competências (Avaliação 360°) " +
    "é a média das notas ponderadas de todas as competências avaliadas.",
  goals:
    "Cada meta tem uma nota esperada e uma nota obtida. Para cada categoria de metas, calcula-se o % de " +
    "alcance (soma do obtido ÷ soma do esperado) e multiplica-se pelo peso da categoria. O resultado de " +
    "Metas é a soma desses valores ponderados dividida pela soma dos pesos das categorias com meta " +
    "cadastrada, numa escala de 0 a 5.",
  exam:
    "A prova é aplicada presencialmente pelo gestor imediato e o resultado é registrado pelo RH/Admin em três " +
    "notas de 0 a 10: Legislação do setor, Legislação específica aplicável à função e Normativos internos. " +
    "A nota da prova é a média ponderada dessas três notas (pesos configuráveis por ciclo, somando 100%), " +
    "convertida para a escala de 0 a 5 dividindo por 2.",
  academic:
    "É considerado o maior nível de formação acadêmica marcado como 'atual' no cadastro da pessoa " +
    "(ex.: Graduação, Pós-Graduação, Mestrado), cada um com uma nota de 0 a 5 definida previamente pelo RH.",
  certification:
    "É a soma dos bônus de todas as certificações profissionais marcadas como obtidas no cadastro da pessoa.",
  overall:
    "O Resultado Final Geral é a média ponderada dos 5 blocos acima (pesos padrão: 60% Competências, 20% " +
    "Metas, 10% Prova de Conhecimentos, 5% Qualificação Acadêmica, 5% Certificações — configuráveis por ciclo). " +
    "Se algum bloco ainda não tem nota, ele é ignorado no cálculo: a nota final é a soma das contribuições dos " +
    "blocos com nota dividida pela soma dos pesos apenas desses blocos, em vez de contar como zero.",
};


function ReportsPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [cycleId, setCycleId] = useState<string | undefined>();
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
      const { data, error } = await supabase.from("v_evaluatee_final_results").select("*").eq("cycle_id", cycleId);
      if (error) throw error;
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

  // Peso de cada bloco no ciclo (usa padrão do sistema se não houver configuração própria)
  const { data: weightConfig } = useQuery({
    queryKey: ["report-weight-config", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluation_weight_config")
        .select("*")
        .eq("cycle_id", cycleId)
        .maybeSingle();
      if (error) throw error;
      return data as EvaluationWeightConfig | null;
    },
  });
  const weights = {
    competencies: weightConfig ? Number(weightConfig.competencies_weight) : DEFAULT_BLOCK_WEIGHTS.competencies,
    goals: weightConfig ? Number(weightConfig.goals_weight) : DEFAULT_BLOCK_WEIGHTS.goals,
    academic: weightConfig ? Number(weightConfig.academic_weight) : DEFAULT_BLOCK_WEIGHTS.academic,
    certification: weightConfig ? Number(weightConfig.certification_weight) : DEFAULT_BLOCK_WEIGHTS.certification,
    exam:
      weightConfig?.knowledge_exam_weight != null
        ? Number(weightConfig.knowledge_exam_weight)
        : DEFAULT_BLOCK_WEIGHTS.knowledgeExam,
  };

  // Prova de Conhecimentos do ciclo (todas as pessoas)
  const { data: examRows } = useQuery({
    queryKey: ["report-exams", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data, error } = await supabase.from("knowledge_exams").select("*").eq("cycle_id", cycleId);
      if (error) throw error;
      return (data ?? []) as KnowledgeExam[];
    },
  });

  const { data: examWeights } = useQuery({
    queryKey: ["report-exam-subweights", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_exam_weight_config")
        .select("*")
        .eq("cycle_id", cycleId)
        .maybeSingle();
      if (error) throw error;
      return data as KnowledgeExamWeightConfig | null;
    },
  });


  // Metas de todo o ciclo (todas as pessoas de uma vez, para montar o relatório)
  const { data: allGoals } = useQuery({
    queryKey: ["report-goals", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data, error } = await supabase.from("goals").select("*").eq("cycle_id", cycleId);
      if (error) throw error;
      return (data ?? []) as Goal[];
    },
  });

  const { data: goalCategories } = useQuery({
    queryKey: ["report-goal-categories", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data, error } = await supabase.from("goal_categories").select("*").eq("cycle_id", cycleId);
      if (error) throw error;
      return (data ?? []) as GoalCategory[];
    },
  });

  // person_id de cada avaliado, para buscar qualificação/certificação
  const personIds = useMemo(() => [...new Set((finals ?? []).map((f) => f.evaluatee_person_id))], [finals]);

  const { data: academicRows } = useQuery({
    queryKey: ["report-academic", personIds],
    enabled: personIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("person_academic_qualifications")
        .select("person_id, is_current, academic_levels(score)")
        .eq("is_current", true)
        .in("person_id", personIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: certRows } = useQuery({
    queryKey: ["report-certifications", personIds],
    enabled: personIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("person_certifications")
        .select("person_id, obtained, certifications_catalog(bonus)")
        .eq("obtained", true)
        .in("person_id", personIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const completionByEvaluatee = (evaluateeId: string) => {
    const items = (progress ?? []).filter((p) => p.evaluatee_id === evaluateeId);
    if (items.length === 0) return 0;
    const sum = items.reduce((s, i) => s + i.pct_complete, 0);
    return Math.round(sum / items.length);
  };

  // ---- Cálculo consolidado, feito no cliente (não depende de v_person_final_score) ----
  function computeConsolidated(f: VEvaluateeFinalResult) {
    const competenciesScore = f.final_result ?? null;

    const goalsByCategory = (goalCategories ?? [])
      .map((cat) => {
        const items = (allGoals ?? []).filter((g) => g.evaluatee_id === f.evaluatee_id && g.category_id === cat.id);
        const expectedSum = items.reduce((s, g) => s + Number(g.expected_score || 0), 0);
        const obtainedSum = items.reduce((s, g) => s + Number(g.obtained_score ?? 0), 0);
        const pctAlcance = expectedSum > 0 ? obtainedSum / expectedSum : null;
        const weightedResult = pctAlcance != null ? pctAlcance * Number(cat.weight) : null;
        return { cat, items, pctAlcance, weightedResult };
      })
      .filter((g) => g.items.length > 0);

    const withData = goalsByCategory.filter((g) => g.weightedResult != null);
    const goalsScore =
      withData.length === 0
        ? null
        : (withData.reduce((s, g) => s + (g.weightedResult ?? 0), 0) /
            withData.reduce((s, g) => s + Number(g.cat.weight), 0)) *
          5;

    const myAcademic = (academicRows ?? []).filter((r) => r.person_id === f.evaluatee_person_id);
    const academicScores = myAcademic.map((r) => r.academic_levels?.score).filter((s) => s != null).map(Number);
    const academicScore = academicScores.length ? Math.max(...academicScores) : null;

    const myCerts = (certRows ?? []).filter((r) => r.person_id === f.evaluatee_person_id);
    const certificationScore = myCerts.length
      ? myCerts.reduce((s, r) => s + Number(r.certifications_catalog?.bonus ?? 0), 0)
      : null;

    const exam = (examRows ?? []).find((e) => e.person_id === f.evaluatee_person_id) ?? null;
    const examScore = computeExamScore(exam, examWeights);

    const overallFinalScore = weightedOverall([
      { score: competenciesScore, weight: weights.competencies },
      { score: goalsScore, weight: weights.goals },
      { score: examScore, weight: weights.exam },
      { score: academicScore, weight: weights.academic },
      { score: certificationScore, weight: weights.certification },
    ]);

    return { competenciesScore, goalsScore, examScore, exam, academicScore, certificationScore, overallFinalScore, goalsByCategory };
  }


  // ---------------------------- EXPORT EXCEL (.xlsx) ----------------------------
  const exportXLSX = async (final: VEvaluateeFinalResult) => {
    setExporting(`xlsx-${final.evaluatee_id}`);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const { data: compData, error } = await supabase
        .from("v_competency_results")
        .select("*")
        .eq("evaluatee_id", final.evaluatee_id)
        .order("display_order");
      if (error) throw error;
      const rows = (compData ?? []) as VCompetencyResult[];
      const c = computeConsolidated(final);

      const wb = new ExcelJS.Workbook();
      wb.creator = "Evoluir 360";
      wb.created = new Date();

      // ---- Aba 1: Resultados ----
      const ws = wb.addWorksheet("Resultados", { pageSetup: { orientation: "landscape" } });
      ws.mergeCells("A1:F1");
      ws.getCell("A1").value = `Avaliação 360° — ${final.evaluatee_name}`;
      ws.getCell("A1").font = { size: 18, bold: true, color: { argb: "FF" + BRAND.primaryHex } };
      ws.mergeCells("A2:F2");
      ws.getCell("A2").value = `Ciclo avaliado — gerado em ${new Date().toLocaleDateString("pt-BR")}`;
      ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF666666" } };
      ws.addRow([]);

      const kpiHeaderRow = ws.addRow(["Bloco", "Nota (0-5)", "Peso", "Contribuição"]);
      styleHeaderRow(kpiHeaderRow);
      const kpiRows: [string, number | null, number][] = [
        ["Competências (Avaliação 360°)", c.competenciesScore, weights.competencies],
        ["Metas", c.goalsScore, weights.goals],
        ["Prova de Conhecimentos", c.examScore, weights.exam],

        ["Qualificação Acadêmica", c.academicScore, weights.academic],
        ["Certificações", c.certificationScore, weights.certification],
      ];
      for (const [label, score, weight] of kpiRows) {
        const row = ws.addRow([label, score != null ? Number(score.toFixed(2)) : "—", `${(weight * 100).toFixed(0)}%`, score != null ? Number((score * weight).toFixed(3)) : "—"]);
        row.eachCell((cell) => (cell.border = THIN_BORDER));
      }
      const finalRow = ws.addRow(["Nota Final Geral", "", "", c.overallFinalScore != null ? Number(c.overallFinalScore.toFixed(2)) : "—"]);
      finalRow.font = { bold: true, size: 12, color: { argb: "FF" + BRAND.primaryHex } };
      finalRow.eachCell((cell) => (cell.border = THIN_BORDER));
      ws.addRow([]);

      const compHeaderRow = ws.addRow(["Dimensão", "Categoria", "Competência", "Gestor", "Pares", "Subordinados", "Auto", "Ponderado"]);
      styleHeaderRow(compHeaderRow, 8);
      for (const r of rows) {
        const row = ws.addRow([r.dimension, r.category, r.competency_name, numOrDash(r.gestor_score), numOrDash(r.pares_score), numOrDash(r.subordinados_score), numOrDash(r.autoavaliacao_score), numOrDash(r.weighted_result)]);
        row.eachCell((cell) => (cell.border = THIN_BORDER));
      }
      ws.columns = [{ width: 14 }, { width: 22 }, { width: 34 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 12 }];

      if (c.goalsByCategory.length > 0) {
        ws.addRow([]);
        const goalsTitle = ws.addRow(["Metas por Categoria"]);
        goalsTitle.getCell(1).font = { bold: true, size: 13, color: { argb: "FF" + BRAND.primaryHex } };
        const goalsHeaderRow = ws.addRow(["Categoria", "Meta", "Peso Categoria", "Esperado", "Obtido", "% Alcance"]);
        styleHeaderRow(goalsHeaderRow, 6);
        for (const g of c.goalsByCategory) {
          for (const item of g.items) {
            const row = ws.addRow([
              g.cat.name,
              item.description,
              `${(Number(g.cat.weight) * 100).toFixed(0)}%`,
              numOrDash(item.expected_score),
              numOrDash(item.obtained_score),
              g.pctAlcance != null ? `${(g.pctAlcance * 100).toFixed(0)}%` : "—",
            ]);
            row.eachCell((cell) => (cell.border = THIN_BORDER));
          }
        }
      }

      if (c.exam) {
        ws.addRow([]);
        const examTitle = ws.addRow(["Prova de Conhecimentos"]);
        examTitle.getCell(1).font = { bold: true, size: 13, color: { argb: "FF" + BRAND.primaryHex } };
        const examHeaderRow = ws.addRow(["Critério", "Nota (0-10)"]);
        styleHeaderRow(examHeaderRow, 2);
        const examItems: [string, number | null][] = [
          ["Legislação do setor", c.exam.sector_legislation_score],
          ["Legislação específica aplicável à função", c.exam.specific_legislation_score],
          ["Normativos internos", c.exam.internal_norms_score],
        ];
        for (const [label, v] of examItems) {
          const row = ws.addRow([label, numOrDash(v)]);
          row.eachCell((cell) => (cell.border = THIN_BORDER));
        }
        const examFinal = ws.addRow(["Nota da prova (0-5)", c.examScore != null ? Number(c.examScore.toFixed(2)) : "—"]);
        examFinal.font = { bold: true, color: { argb: "FF" + BRAND.primaryHex } };
      }

      // ---- Aba 2: Metodologia ----
      const wsM = wb.addWorksheet("Metodologia de Cálculo");
      wsM.mergeCells("A1:B1");
      wsM.getCell("A1").value = "Metodologia de Cálculo";
      wsM.getCell("A1").font = { size: 16, bold: true, color: { argb: "FF" + BRAND.primaryHex } };
      wsM.columns = [{ width: 26 }, { width: 100 }];
      const methodRows: [string, string][] = [
        ["1. Competências (60%)", METHOD_TEXT.competencies],
        ["2. Metas (20%)", METHOD_TEXT.goals],
        ["3. Prova de Conhecimentos (10%)", METHOD_TEXT.exam],
        ["4. Qualificação Acadêmica (5%)", METHOD_TEXT.academic],
        ["5. Certificações (5%)", METHOD_TEXT.certification],
        ["Resultado Final Geral", METHOD_TEXT.overall],
      ];

      wsM.addRow([]);
      for (const [title, text] of methodRows) {
        const row = wsM.addRow([title, text]);
        row.getCell(1).font = { bold: true };
        row.getCell(2).alignment = { wrapText: true, vertical: "top" };
        row.height = 60;
      }
      wsM.getColumn(1).alignment = { vertical: "top" };

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      triggerDownload(blob, `avaliacao_${final.evaluatee_name.replace(/\s+/g, "_")}.xlsx`);
    } catch (err: any) {
      toast.error(`Erro ao gerar Excel: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  // ---------------------------- EXPORT PDF ----------------------------
  const exportPDF = async (final: VEvaluateeFinalResult) => {
    setExporting(`pdf-${final.evaluatee_id}`);
    try {
      const { data: compData, error } = await supabase
        .from("v_competency_results")
        .select("*")
        .eq("evaluatee_id", final.evaluatee_id)
        .order("display_order");
      if (error) throw error;
      const rows = (compData ?? []) as VCompetencyResult[];
      const c = computeConsolidated(final);

      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Cabeçalho com faixa de cor
      doc.setFillColor(...BRAND.primaryRgb);
      doc.rect(0, 0, pageWidth, 32, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text("Avaliação 360°", 14, 14);
      doc.setFontSize(12);
      doc.text(final.evaluatee_name, 14, 23);
      doc.setFontSize(8);
      doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, pageWidth - 14, 14, { align: "right" });
      doc.setTextColor(0, 0, 0);

      let y = 42;
      doc.setFontSize(13);
      doc.setTextColor(...BRAND.primaryRgb);
      doc.text("Resultado Consolidado", 14, y);
      doc.setTextColor(0, 0, 0);
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [["Bloco", "Nota (0-5)", "Peso", "Contribuição"]],
        body: [
          ["Competências (Avaliação 360°)", fmt(c.competenciesScore), `${(weights.competencies * 100).toFixed(0)}%`, fmt(c.competenciesScore != null ? c.competenciesScore * weights.competencies : null)],
          ["Metas", fmt(c.goalsScore), `${(weights.goals * 100).toFixed(0)}%`, fmt(c.goalsScore != null ? c.goalsScore * weights.goals : null)],
          ["Prova de Conhecimentos", fmt(c.examScore), `${(weights.exam * 100).toFixed(0)}%`, fmt(c.examScore != null ? c.examScore * weights.exam : null)],

          ["Qualificação Acadêmica", fmt(c.academicScore), `${(weights.academic * 100).toFixed(0)}%`, fmt(c.academicScore != null ? c.academicScore * weights.academic : null)],
          ["Certificações", fmt(c.certificationScore), `${(weights.certification * 100).toFixed(0)}%`, fmt(c.certificationScore != null ? c.certificationScore * weights.certification : null)],
        ],
        foot: [["Nota Final Geral", "", "", fmt(c.overallFinalScore)]],
        theme: "striped",
        headStyles: { fillColor: BRAND.primaryRgb },
        footStyles: { fillColor: [230, 240, 238], textColor: BRAND.primaryRgb, fontStyle: "bold" },
        styles: { fontSize: 9 },
      });

      y = (doc as any).lastAutoTable.finalY + 12;
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(13);
      doc.setTextColor(...BRAND.primaryRgb);
      doc.text("Detalhamento por Competência", 14, y);
      doc.setTextColor(0, 0, 0);
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [["Competência", "Dimensão", "Gestor", "Pares", "Sub.", "Auto", "Ponderado"]],
        body: rows.map((r) => [r.competency_name, r.dimension, fmt(r.gestor_score), fmt(r.pares_score), fmt(r.subordinados_score), fmt(r.autoavaliacao_score), fmt(r.weighted_result)]),
        theme: "grid",
        headStyles: { fillColor: BRAND.accentRgb },
        styles: { fontSize: 8 },
        margin: { top: 10 },
      });

      if (c.goalsByCategory.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 12;
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(13);
        doc.setTextColor(...BRAND.primaryRgb);
        doc.text("Metas por Categoria", 14, y);
        doc.setTextColor(0, 0, 0);
        y += 4;
        const goalRows: any[] = [];
        for (const g of c.goalsByCategory) {
          for (const item of g.items) {
            goalRows.push([g.cat.name, item.description, fmt(item.expected_score), fmt(item.obtained_score), g.pctAlcance != null ? `${(g.pctAlcance * 100).toFixed(0)}%` : "—"]);
          }
        }
        autoTable(doc, {
          startY: y,
          head: [["Categoria", "Meta", "Esperado", "Obtido", "% Alcance"]],
          body: goalRows,
          theme: "grid",
          headStyles: { fillColor: BRAND.accentRgb },
          styles: { fontSize: 8 },
        });
      }

      if (c.exam) {
        y = (doc as any).lastAutoTable.finalY + 12;
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(13);
        doc.setTextColor(...BRAND.primaryRgb);
        doc.text("Prova de Conhecimentos", 14, y);
        doc.setTextColor(0, 0, 0);
        y += 4;
        autoTable(doc, {
          startY: y,
          head: [["Critério", "Nota (0-10)"]],
          body: [
            ["Legislação do setor", fmt(c.exam.sector_legislation_score)],
            ["Legislação específica aplicável à função", fmt(c.exam.specific_legislation_score)],
            ["Normativos internos", fmt(c.exam.internal_norms_score)],
          ],
          foot: [["Nota da prova (0-5)", fmt(c.examScore)]],
          theme: "grid",
          headStyles: { fillColor: BRAND.accentRgb },
          footStyles: { fillColor: [230, 240, 238], textColor: BRAND.primaryRgb, fontStyle: "bold" },
          styles: { fontSize: 8 },
        });
      }

      // ---- Página de metodologia ----
      doc.addPage();
      doc.setFillColor(...BRAND.primaryRgb);
      doc.rect(0, 0, pageWidth, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15);
      doc.text("Metodologia de Cálculo", 14, 15);
      doc.setTextColor(0, 0, 0);

      let my = 34;
      const methodItems: [string, string][] = [
        ["1. Competências — Avaliação 360° (peso padrão 60%)", METHOD_TEXT.competencies],
        ["2. Metas (peso padrão 20%)", METHOD_TEXT.goals],
        ["3. Prova de Conhecimentos (peso padrão 10%)", METHOD_TEXT.exam],
        ["4. Qualificação Acadêmica (peso padrão 5%)", METHOD_TEXT.academic],
        ["5. Certificações (peso padrão 5%)", METHOD_TEXT.certification],
        ["Resultado Final Geral", METHOD_TEXT.overall],
      ];

      doc.setFontSize(10);
      for (const [title, text] of methodItems) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BRAND.primaryRgb);
        doc.text(title, 14, my);
        my += 6;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(40, 40, 40);
        const lines = doc.splitTextToSize(text, pageWidth - 28);
        doc.text(lines, 14, my);
        my += lines.length * 5 + 8;
        if (my > 265) { doc.addPage(); my = 20; }
      }

      doc.save(`avaliacao_${final.evaluatee_name.replace(/\s+/g, "_")}.pdf`);
    } catch (err: any) {
      toast.error(`Erro ao gerar PDF: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
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
          <Table data-tour="reports-table">
            <TableHeader>
              <TableRow>
                <TableHead>Avaliado</TableHead>
                <TableHead className="text-right">Gestor</TableHead>
                <TableHead className="text-right">Pares</TableHead>
                <TableHead className="text-right">Sub.</TableHead>
                <TableHead className="text-right">Auto</TableHead>
                <TableHead className="text-right">Compet.</TableHead>
                <TableHead className="text-right">Metas</TableHead>
                <TableHead className="text-right">Prova</TableHead>

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
                const c = computeConsolidated(f);
                return (
                  <TableRow key={f.evaluatee_id}>
                    <TableCell className="font-medium">{f.evaluatee_name}</TableCell>
                    <TableCell className="text-right">{fmt(f.gestor_avg)}</TableCell>
                    <TableCell className="text-right">{fmt(f.pares_avg)}</TableCell>
                    <TableCell className="text-right">{fmt(f.subordinados_avg)}</TableCell>
                    <TableCell className="text-right">{fmt(f.autoavaliacao_avg)}</TableCell>
                    <TableCell className="text-right">{fmt(c.competenciesScore)}</TableCell>
                    <TableCell className="text-right">{fmt(c.goalsScore)}</TableCell>
                    <TableCell className="text-right">{fmt(c.examScore)}</TableCell>

                    <TableCell className="text-right">{fmt(c.academicScore)}</TableCell>
                    <TableCell className="text-right">{fmt(c.certificationScore)}</TableCell>
                    <TableCell className="text-right font-bold text-primary">{fmt(c.overallFinalScore)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="flex-1" />
                        <span className="text-xs w-10 text-right">{pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right" data-tour="report-export">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" onClick={() => exportXLSX(f)} disabled={exporting === `xlsx-${f.evaluatee_id}`}>
                          <Download className="h-3 w-3 mr-1" /> Excel
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => exportPDF(f)} disabled={exporting === `pdf-${f.evaluatee_id}`}>
                          <FileText className="h-3 w-3 mr-1" /> PDF
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

const THIN_BORDER = {
  top: { style: "thin" as const, color: { argb: "FFDDDDDD" } },
  bottom: { style: "thin" as const, color: { argb: "FFDDDDDD" } },
};

function styleHeaderRow(row: any, cols = 4) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  for (let i = 1; i <= cols; i++) {
    row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + BRAND.primaryHex } };
    row.getCell(i).border = THIN_BORDER;
  }
}

function numOrDash(v: number | null | undefined) {
  return v == null ? "—" : Number(v);
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
