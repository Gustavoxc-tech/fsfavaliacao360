import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { EvaluationCycle, Person, EvaluatorType, Evaluatee, EvaluationAssignment } from "@/lib/db-types";

export const Route = createFileRoute("/_app/admin/assignments")({
  component: AdminAssignments,
});

function AdminAssignments() {
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState<string | undefined>();
  const [assignDialog, setAssignDialog] = useState<{ open: boolean; evaluateeId?: string }>({ open: false });
  const [assignForm, setAssignForm] = useState({ evaluator_person_id: "", evaluator_type_id: "" });

  const { data: cycles } = useQuery({
    queryKey: ["cycles"],
    queryFn: async () => {
      const { data } = await supabase.from("evaluation_cycles").select("*").order("start_date", { ascending: false });
      return (data ?? []) as EvaluationCycle[];
    },
  });

  const { data: people } = useQuery({
    queryKey: ["all-people"],
    queryFn: async () => {
      const { data } = await supabase.from("people").select("*").eq("is_active", true).order("full_name");
      return (data ?? []) as Person[];
    },
  });

  const { data: types } = useQuery({
    queryKey: ["evaluator-types"],
    queryFn: async () => {
      const { data } = await supabase.from("evaluator_types").select("*").order("display_order");
      return (data ?? []) as EvaluatorType[];
    },
  });

  // Avaliados deste ciclo: agora definidos na aba Pessoas (switch "Avaliado
  // neste ciclo"). Esta tela só lê a lista, não cria mais avaliado aqui —
  // evita ter o mesmo cadastro em dois lugares.
  const { data: evaluatees } = useQuery({
    queryKey: ["evaluatees-by-cycle", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data } = await supabase.from("evaluatees").select("*").eq("cycle_id", cycleId);
      return (data ?? []) as Evaluatee[];
    },
  });

  const evaluateeIds = useMemo(() => (evaluatees ?? []).map((e) => e.id), [evaluatees]);

  const { data: assignments } = useQuery({
    queryKey: ["assignments", cycleId, evaluateeIds.join(",")],
    enabled: evaluateeIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("evaluation_assignments").select("*").in("evaluatee_id", evaluateeIds);
      return (data ?? []) as EvaluationAssignment[];
    },
  });

  const peopleById = useMemo(() => Object.fromEntries((people ?? []).map((p) => [p.id, p])), [people]);
  const typeById = useMemo(() => Object.fromEntries((types ?? []).map((t) => [t.id, t])), [types]);

  const addAssignment = useMutation({
    mutationFn: async () => {
      if (!assignDialog.evaluateeId) return;
      const { error } = await supabase.from("evaluation_assignments").insert({
        evaluatee_id: assignDialog.evaluateeId,
        evaluator_person_id: assignForm.evaluator_person_id,
        evaluator_type_id: assignForm.evaluator_type_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atribuição criada");
      setAssignDialog({ open: false });
      setAssignForm({ evaluator_person_id: "", evaluator_type_id: "" });
      qc.invalidateQueries({ queryKey: ["assignments", cycleId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("evaluation_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignments", cycleId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Label className="text-sm">Ciclo:</Label>
            <Select value={cycleId} onValueChange={setCycleId}>
              <SelectTrigger className="w-[300px]"><SelectValue placeholder="Selecionar ciclo" /></SelectTrigger>
              <SelectContent>
                {cycles?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {cycleId && (
        <Card>
          <CardContent className="py-6 space-y-4">
            <h3 className="font-semibold">Avaliados e suas atribuições</h3>

            {evaluatees?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum avaliado neste ciclo ainda. Vá em{" "}
                <Link to="/admin/people" className="underline font-medium">Pessoas</Link>{" "}
                e ative "Avaliado neste ciclo" para quem deve participar.
              </p>
            )}

            <div className="space-y-4">
              {evaluatees?.map((ev) => {
                const evAssign = (assignments ?? []).filter((a) => a.evaluatee_id === ev.id);
                const evPerson = peopleById[ev.person_id];
                return (
                  <div key={ev.id} className="border rounded-md p-4">
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <div className="font-medium">{evPerson?.full_name}</div>
                        <div className="text-xs text-muted-foreground">{evPerson?.job_title}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setAssignDialog({ open: true, evaluateeId: ev.id })}>
                        <Plus className="h-3 w-3 mr-1" /> Avaliador
                      </Button>
                    </div>
                    {evAssign.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem avaliadores atribuídos.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Avaliador</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {evAssign.map((a) => (
                            <TableRow key={a.id}>
                              <TableCell>{peopleById[a.evaluator_person_id]?.full_name}</TableCell>
                              <TableCell>{typeById[a.evaluator_type_id]?.label}</TableCell>
                              <TableCell><Badge variant="outline">{a.status}</Badge></TableCell>
                              <TableCell className="text-right">
                                <Button size="icon" variant="ghost" onClick={() => removeAssignment.mutate(a.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={assignDialog.open} onOpenChange={(o) => setAssignDialog({ open: o, evaluateeId: assignDialog.evaluateeId })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Atribuir avaliador</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Avaliador</Label>
              <Select value={assignForm.evaluator_person_id} onValueChange={(v) => setAssignForm({ ...assignForm, evaluator_person_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar pessoa" /></SelectTrigger>
                <SelectContent>
                  {people?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={assignForm.evaluator_type_id} onValueChange={(v) => setAssignForm({ ...assignForm, evaluator_type_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar tipo" /></SelectTrigger>
                <SelectContent>
                  {types?.map((t) => <SelectItem key={t.id} value={t.id}>{t.label} ({Math.round(t.weight * 100)}%)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => addAssignment.mutate()}
              disabled={!assignForm.evaluator_person_id || !assignForm.evaluator_type_id}
            >
              Criar atribuição
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
