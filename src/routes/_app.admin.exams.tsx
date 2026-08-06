import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import type { EvaluationCycle, KnowledgeExam, KnowledgeExamWeightConfig, Person } from "@/lib/db-types";
import { computeExamScore, examSubWeights } from "@/lib/exam";

export const Route = createFileRoute("/_app/admin/exams")({
  component: AdminExams,
});

function fmt(v: number | null | undefined) {
  return v == null ? "—" : Number(v).toFixed(2);
}

function AdminExams() {
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState<string | undefined>();
  const [personId, setPersonId] = useState<string | undefined>();
  const [form, setForm] = useState({ sector: "", specific: "", internal: "" });
  const [w, setW] = useState({ sector: "", specific: "", internal: "" });

  const { data: cycles } = useQuery({
    queryKey: ["exam-cycles"],
    queryFn: async () => {
      const { data } = await supabase.from("evaluation_cycles").select("*").order("start_date", { ascending: false });
      return (data ?? []) as EvaluationCycle[];
    },
  });

  useEffect(() => {
    if (!cycleId && cycles && cycles.length > 0) setCycleId(cycles[0].id);
  }, [cycles, cycleId]);

  const { data: people } = useQuery({
    queryKey: ["all-people"],
    queryFn: async () => {
      const { data } = await supabase.from("people").select("*").eq("is_active", true).order("full_name");
      return (data ?? []) as Person[];
    },
  });

  const { data: subWeights } = useQuery({
    queryKey: ["exam-subweights", cycleId],
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

  useEffect(() => {
    const sw = examSubWeights(subWeights);
    setW({
      sector: (sw.sector * 100).toFixed(2),
      specific: (sw.specific * 100).toFixed(2),
      internal: (sw.internal * 100).toFixed(2),
    });
  }, [subWeights, cycleId]);

  const { data: exams } = useQuery({
    queryKey: ["exams", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data, error } = await supabase.from("knowledge_exams").select("*").eq("cycle_id", cycleId);
      if (error) throw error;
      return (data ?? []) as KnowledgeExam[];
    },
  });

  const currentExam = exams?.find((e) => e.person_id === personId) ?? null;

  useEffect(() => {
    setForm({
      sector: currentExam?.sector_legislation_score != null ? String(currentExam.sector_legislation_score) : "",
      specific: currentExam?.specific_legislation_score != null ? String(currentExam.specific_legislation_score) : "",
      internal: currentExam?.internal_norms_score != null ? String(currentExam.internal_norms_score) : "",
    });
  }, [currentExam?.id, personId, cycleId]);

  const parseNote = (v: string) => {
    if (v.trim() === "") return null;
    const n = Number(v.replace(",", "."));
    if (Number.isNaN(n) || n < 0 || n > 10) throw new Error("As notas devem estar entre 0 e 10.");
    return Math.round(n * 100) / 100;
  };

  const saveExam = useMutation({
    mutationFn: async () => {
      if (!cycleId || !personId) throw new Error("Selecione o ciclo e o colaborador.");
      const payload = {
        person_id: personId,
        cycle_id: cycleId,
        sector_legislation_score: parseNote(form.sector),
        specific_legislation_score: parseNote(form.specific),
        internal_norms_score: parseNote(form.internal),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("knowledge_exams").upsert(payload, { onConflict: "person_id,cycle_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notas da prova salvas");
      qc.invalidateQueries({ queryKey: ["exams", cycleId] });
      qc.invalidateQueries({ queryKey: ["my-exam"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveWeights = useMutation({
    mutationFn: async () => {
      if (!cycleId) throw new Error("Selecione um ciclo.");
      const nums = [Number(w.sector), Number(w.specific), Number(w.internal)];
      if (nums.some((n) => Number.isNaN(n) || n < 0)) throw new Error("Pesos inválidos.");
      const sum = nums.reduce((s, n) => s + n, 0);
      if (Math.abs(sum - 100) > 0.01) throw new Error(`A soma dos pesos deve ser 100% (atual: ${sum.toFixed(2)}%).`);
      const { error } = await supabase.from("knowledge_exam_weight_config").upsert(
        {
          cycle_id: cycleId,
          sector_legislation_weight: nums[0] / 100,
          specific_legislation_weight: nums[1] / 100,
          internal_norms_weight: nums[2] / 100,
        },
        { onConflict: "cycle_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pesos da prova atualizados");
      qc.invalidateQueries({ queryKey: ["exam-subweights", cycleId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const weightSum = Number(w.sector || 0) + Number(w.specific || 0) + Number(w.internal || 0);
  const preview = computeExamScore(
    {
      id: "",
      person_id: "",
      cycle_id: "",
      sector_legislation_score: form.sector === "" ? null : Number(form.sector.replace(",", ".")),
      specific_legislation_score: form.specific === "" ? null : Number(form.specific.replace(",", ".")),
      internal_norms_score: form.internal === "" ? null : Number(form.internal.replace(",", ".")),
      notes: null,
    },
    subWeights,
  );

  const peopleById = new Map((people ?? []).map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
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
        <CardHeader>
          <CardTitle className="text-base">Pesos dos subcritérios da prova</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Legislação do setor (%)</Label>
              <Input type="number" step="0.01" value={w.sector} onChange={(e) => setW({ ...w, sector: e.target.value })} />
            </div>
            <div>
              <Label>Legislação específica da função (%)</Label>
              <Input type="number" step="0.01" value={w.specific} onChange={(e) => setW({ ...w, specific: e.target.value })} />
            </div>
            <div>
              <Label>Normativos internos (%)</Label>
              <Input type="number" step="0.01" value={w.internal} onChange={(e) => setW({ ...w, internal: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm ${Math.abs(weightSum - 100) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
              Soma: {weightSum.toFixed(2)}%
            </span>
            <Button size="sm" onClick={() => saveWeights.mutate()} disabled={saveWeights.isPending || !cycleId}>
              Salvar pesos
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Lançar notas da prova</CardTitle>
          <Select value={personId} onValueChange={setPersonId}>
            <SelectTrigger className="w-[280px]"><SelectValue placeholder="Selecionar colaborador" /></SelectTrigger>
            <SelectContent>
              {people?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            A prova é aplicada presencialmente pelo gestor imediato — aqui o sistema apenas registra o resultado (notas de 0 a 10).
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Legislação do setor</Label>
              <Input type="number" step="0.01" min="0" max="10" disabled={!personId} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
            </div>
            <div>
              <Label>Legislação específica da função</Label>
              <Input type="number" step="0.01" min="0" max="10" disabled={!personId} value={form.specific} onChange={(e) => setForm({ ...form, specific: e.target.value })} />
            </div>
            <div>
              <Label>Normativos internos</Label>
              <Input type="number" step="0.01" min="0" max="10" disabled={!personId} value={form.internal} onChange={(e) => setForm({ ...form, internal: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="rounded-md bg-secondary/60 px-3 py-2 text-sm">
              <div className="text-[11px] text-muted-foreground">Nota da prova (0 a 5)</div>
              <div className="text-base font-semibold">{fmt(preview)}</div>
            </div>
            <Button onClick={() => saveExam.mutate()} disabled={saveExam.isPending || !personId || !cycleId}>
              Salvar notas
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Notas lançadas no ciclo</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead className="text-right">Leg. setor</TableHead>
                <TableHead className="text-right">Leg. específica</TableHead>
                <TableHead className="text-right">Normativos</TableHead>
                <TableHead className="text-right">Nota final (0-5)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(exams ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{peopleById.get(e.person_id)?.full_name ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmt(e.sector_legislation_score)}</TableCell>
                  <TableCell className="text-right">{fmt(e.specific_legislation_score)}</TableCell>
                  <TableCell className="text-right">{fmt(e.internal_norms_score)}</TableCell>
                  <TableCell className="text-right font-bold text-primary">{fmt(computeExamScore(e, subWeights))}</TableCell>
                </TableRow>
              ))}
              {(exams ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Nenhuma nota lançada neste ciclo.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
