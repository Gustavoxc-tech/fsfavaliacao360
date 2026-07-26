import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Competency, EvaluationCycle, Evaluatee, Person, CompetencyAssignment } from "@/lib/db-types";

export const Route = createFileRoute("/_app/admin/competencies")({
  component: AdminCompetencies,
});

function AdminCompetencies() {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["all-competencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("competencies").select("*").order("display_order");
      if (error) throw error;
      return data as Competency[];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("competencies").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-competencies"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Catálogo global</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {data?.length ?? 0} competências cadastradas. Desative as que não devem entrar nas avaliações.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Dimensão</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Competência</TableHead>
                <TableHead className="text-right">Ativa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-muted-foreground">{c.display_order}</TableCell>
                  <TableCell><Badge variant="outline">{c.dimension}</Badge></TableCell>
                  <TableCell className="text-sm">{c.category}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-right">
                    <Switch checked={c.is_active} onCheckedChange={(v) => toggle.mutate({ id: c.id, is_active: v })} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PerEvaluateeSection allCompetencies={data ?? []} />
    </div>
  );
}

function PerEvaluateeSection({ allCompetencies }: { allCompetencies: Competency[] }) {
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState<string | undefined>();
  const [evaluateeId, setEvaluateeId] = useState<string | undefined>();

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

  const { data: evaluatees } = useQuery({
    queryKey: ["evaluatees-cycle-comp", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data } = await supabase
        .from("evaluatees")
        .select("*, people(full_name)")
        .eq("cycle_id", cycleId);
      return (data ?? []) as (Evaluatee & { people: Pick<Person, "full_name"> })[];
    },
  });

  useEffect(() => { setEvaluateeId(undefined); }, [cycleId]);

  const { data: assigned } = useQuery({
    queryKey: ["comp-assignments", evaluateeId],
    enabled: !!evaluateeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competency_assignments")
        .select("*")
        .eq("evaluatee_id", evaluateeId);
      if (error) throw error;
      return (data ?? []) as CompetencyAssignment[];
    },
  });

  const assignedSet = new Set((assigned ?? []).map((a) => a.competency_id));

  const toggleAssign = useMutation({
    mutationFn: async ({ competency_id, on }: { competency_id: string; on: boolean }) => {
      if (!evaluateeId) return;
      if (on) {
        const { error } = await supabase
          .from("competency_assignments")
          .insert({ evaluatee_id: evaluateeId, competency_id });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("competency_assignments")
          .delete()
          .eq("evaluatee_id", evaluateeId)
          .eq("competency_id", competency_id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comp-assignments", evaluateeId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const active = allCompetencies.filter((c) => c.is_active);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Competências por avaliado</CardTitle>
        <p className="text-xs text-muted-foreground">
          Novos avaliados recebem automaticamente todas as competências ativas. Use esta seção só para customizar exceções por pessoa.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Label>Ciclo:</Label>
            <Select value={cycleId} onValueChange={setCycleId}>
              <SelectTrigger className="w-[260px]"><SelectValue placeholder="Selecionar ciclo" /></SelectTrigger>
              <SelectContent>
                {cycles?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label>Avaliado:</Label>
            <Select value={evaluateeId} onValueChange={setEvaluateeId}>
              <SelectTrigger className="w-[280px]"><SelectValue placeholder="Selecionar avaliado" /></SelectTrigger>
              <SelectContent>
                {evaluatees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.people?.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {evaluateeId ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Dimensão</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Competência</TableHead>
                <TableHead className="text-right">Atribuída</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((c) => {
                const on = assignedSet.has(c.id);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-muted-foreground">{c.display_order}</TableCell>
                    <TableCell><Badge variant="outline">{c.dimension}</Badge></TableCell>
                    <TableCell className="text-sm">{c.category}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={on}
                        onCheckedChange={(v) => toggleAssign.mutate({ competency_id: c.id, on: !!v })}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-6">Selecione um ciclo e um avaliado.</div>
        )}
      </CardContent>
    </Card>
  );
}
