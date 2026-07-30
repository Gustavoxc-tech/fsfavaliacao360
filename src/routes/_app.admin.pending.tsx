import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/PersonAvatar";
import { PersonProfileDrawer } from "@/components/PersonProfileDrawer";
import { Eye } from "lucide-react";
import type { EvaluationCycle, Person, VAssignmentProgress } from "@/lib/db-types";

export const Route = createFileRoute("/_app/admin/pending")({
  component: AdminPending,
});

function AdminPending() {
  const [cycleId, setCycleId] = useState<string | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPerson, setDrawerPerson] = useState<Person | null>(null);

  const { data: cycles } = useQuery({
    queryKey: ["cycles"],
    queryFn: async () => {
      const { data } = await supabase.from("evaluation_cycles").select("*").order("start_date", { ascending: false });
      return (data ?? []) as EvaluationCycle[];
    },
  });

  useEffect(() => {
    if (!cycleId && cycles?.length) {
      const openC = cycles.find((c) => c.status === "open");
      setCycleId(openC?.id ?? cycles[0].id);
    }
  }, [cycles, cycleId]);

  const { data: progress } = useQuery({
    queryKey: ["admin-progress", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data } = await supabase
        .from("v_assignment_progress")
        .select("*")
        .eq("cycle_id", cycleId);
      return (data ?? []) as VAssignmentProgress[];
    },
  });

  const { data: people } = useQuery({
    queryKey: ["all-people"],
    queryFn: async () => {
      const { data } = await supabase.from("people").select("*");
      return (data ?? []) as Person[];
    },
  });

  const peopleMap = useMemo(() => {
    const m = new Map<string, Person>();
    (people ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [people]);

  const pending = (progress ?? []).filter((a) => a.status !== "completed");

  return (
    <div className="space-y-4">
      <Card className="card-hover">
        <CardContent className="py-4 flex items-center gap-3">
          <Label className="text-sm whitespace-nowrap">Ciclo:</Label>
          <Select value={cycleId} onValueChange={setCycleId}>
            <SelectTrigger className="w-[280px]"><SelectValue placeholder="Selecionar ciclo" /></SelectTrigger>
            <SelectContent>
              {cycles?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">
            {pending.length} avaliaç{pending.length === 1 ? "ão" : "ões"} pendente(s)
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {pending.map((a) => {
          const person = peopleMap.get(a.evaluatee_id) ?? null;
          // pct_complete já vem em escala 0-100 da view — não multiplicar de novo
          const pct = Math.round(a.pct_complete ?? 0);
          return (
            <div
              key={a.assignment_id}
              className="rounded-2xl bg-card border p-5 card-hover flex flex-col gap-4"
            >
              <div className="flex items-start gap-3">
                <PersonAvatar name={a.evaluatee_name} url={person?.avatar_url} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{a.evaluatee_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {person?.job_title ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {person?.diretoria ?? "—"}{person?.area ? ` • ${person.area}` : ""}
                  </div>
                </div>
                <Badge variant={a.status === "in_progress" ? "secondary" : "outline"}>
                  {a.status === "in_progress" ? "Em andamento" : "Pendente"}
                </Badge>
              </div>

              <div className="text-xs text-muted-foreground">
                Avaliador: <span className="font-medium text-foreground">{a.evaluator_name}</span> · {a.evaluator_type_label}
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Progresso</span>
                  <span className="font-medium">{a.scores_filled}/{a.total_competencies} · {pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full progress-gradient transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (person) { setDrawerPerson(person); setDrawerOpen(true); }
                  }}
                  disabled={!person}
                >
                  <Eye className="h-4 w-4 mr-1" /> Ver perfil
                </Button>
              </div>
            </div>
          );
        })}
        {pending.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-12">
            Nenhuma avaliação pendente neste ciclo.
          </div>
        )}
      </div>

      <PersonProfileDrawer person={drawerPerson} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
