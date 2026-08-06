import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { EvaluationCycle, EvaluationWeightConfig } from "@/lib/db-types";
import { DEFAULT_BLOCK_WEIGHTS } from "@/lib/exam";

export const Route = createFileRoute("/_app/admin/weights")({
  component: AdminWeights,
});

type Form = { competencies: string; goals: string; academic: string; certification: string; exam: string };

const toPct = (v: number) => (v * 100).toFixed(2);

function AdminWeights() {
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState<string | undefined>();
  const [form, setForm] = useState<Form>({
    competencies: toPct(DEFAULT_BLOCK_WEIGHTS.competencies),
    goals: toPct(DEFAULT_BLOCK_WEIGHTS.goals),
    academic: toPct(DEFAULT_BLOCK_WEIGHTS.academic),
    certification: toPct(DEFAULT_BLOCK_WEIGHTS.certification),
    exam: toPct(DEFAULT_BLOCK_WEIGHTS.knowledgeExam),
  });

  const { data: cycles } = useQuery({
    queryKey: ["weights-cycles"],
    queryFn: async () => {
      const { data } = await supabase.from("evaluation_cycles").select("*").order("start_date", { ascending: false });
      return (data ?? []) as EvaluationCycle[];
    },
  });

  useEffect(() => {
    if (!cycleId && cycles && cycles.length > 0) setCycleId(cycles[0].id);
  }, [cycles, cycleId]);

  const { data: config } = useQuery({
    queryKey: ["weights-config", cycleId],
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

  useEffect(() => {
    setForm({
      competencies: toPct(config ? Number(config.competencies_weight) : DEFAULT_BLOCK_WEIGHTS.competencies),
      goals: toPct(config ? Number(config.goals_weight) : DEFAULT_BLOCK_WEIGHTS.goals),
      academic: toPct(config ? Number(config.academic_weight) : DEFAULT_BLOCK_WEIGHTS.academic),
      certification: toPct(config ? Number(config.certification_weight) : DEFAULT_BLOCK_WEIGHTS.certification),
      exam: toPct(config ? Number(config.knowledge_exam_weight ?? DEFAULT_BLOCK_WEIGHTS.knowledgeExam) : DEFAULT_BLOCK_WEIGHTS.knowledgeExam),
    });
  }, [config, cycleId]);

  const sum = Object.values(form).reduce((s, v) => s + (Number(v) || 0), 0);
  const valid = Math.abs(sum - 100) <= 0.01;

  const save = useMutation({
    mutationFn: async () => {
      if (!cycleId) throw new Error("Selecione um ciclo.");
      if (!valid) throw new Error(`A soma dos pesos deve ser 100% (atual: ${sum.toFixed(2)}%).`);
      const { error } = await supabase.from("evaluation_weight_config").upsert(
        {
          cycle_id: cycleId,
          competencies_weight: Number(form.competencies) / 100,
          goals_weight: Number(form.goals) / 100,
          academic_weight: Number(form.academic) / 100,
          certification_weight: Number(form.certification) / 100,
          knowledge_exam_weight: Number(form.exam) / 100,
        },
        { onConflict: "cycle_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pesos gerais atualizados");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const field = (key: keyof Form, label: string) => (
    <div>
      <Label>{label} (%)</Label>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

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
        <CardHeader><CardTitle className="text-base">Pesos dos blocos no resultado final</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {field("competencies", "Competências (360°)")}
            {field("goals", "Metas")}
            {field("exam", "Prova de Conhecimentos")}
            {field("academic", "Qualificação Acadêmica")}
            {field("certification", "Certificações")}
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${valid ? "text-muted-foreground" : "text-destructive"}`}>
              Soma: {sum.toFixed(2)}%
            </span>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !cycleId || !valid}>
              Salvar pesos
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Se um bloco ainda não tiver nota lançada, ele é ignorado no cálculo e a nota final é ponderada apenas entre os blocos com nota.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
