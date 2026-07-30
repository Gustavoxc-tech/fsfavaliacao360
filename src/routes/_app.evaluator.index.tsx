import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/PersonAvatar";
import { CalendarClock, CalendarCheck2 } from "lucide-react";
import type { VAssignmentProgress, EvaluationCycle } from "@/lib/db-types";

export const Route = createFileRoute("/_app/evaluator/")({
  component: EvaluatorList,
});

// Pendente/Em Andamento primeiro (precisam de ação), Concluída por último
const STATUS_ORDER: Record<string, number> = { pending: 0, in_progress: 1, completed: 2 };

function EvaluatorList() {
  const { person } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["my-assignments", person?.id],
    enabled: !!person?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_assignment_progress")
        .select("*")
        .eq("evaluator_person_id", person!.id);
      if (error) throw error;
      return data as VAssignmentProgress[];
    },
  });

  const sorted = useMemo(() => {
    return [...(data ?? [])].sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99));
  }, [data]);

  const cycleIds = useMemo(() => [...new Set((data ?? []).map((a) => a.cycle_id))], [data]);
  const evaluateeIds = useMemo(() => [...new Set((data ?? []).map((a) => a.evaluatee_id))], [data]);

  // Nome e prazo do ciclo (a view v_assignment_progress só traz o cycle_id)
  const { data: cycles } = useQuery({
    queryKey: ["assignment-cycles", cycleIds],
    enabled: cycleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("evaluation_cycles").select("*").in("id", cycleIds);
      if (error) throw error;
      return (data ?? []) as EvaluationCycle[];
    },
  });
  const cycleById = (id: string) => cycles?.find((c) => c.id === id);

  // Foto do avaliado (a view não traz o avatar, então buscamos via evaluatees -> people)
  const { data: evaluateePhotos } = useQuery({
    queryKey: ["assignment-evaluatee-photos", evaluateeIds],
    enabled: evaluateeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluatees")
        .select("id, people(avatar_url)")
        .in("id", evaluateeIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const photoByEvaluatee = (evaluateeId: string) =>
    evaluateePhotos?.find((e) => e.id === evaluateeId)?.people?.avatar_url ?? null;

  const statusBadge = (status: string) => {
    if (status === "completed") return <Badge>Concluída</Badge>;
    if (status === "in_progress") return <Badge variant="secondary">Em andamento</Badge>;
    return (
      <Badge className="bg-amber-500 text-white hover:bg-amber-500/90 border-transparent">Pendente</Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Minhas Avaliações</h1>
        <p className="text-sm text-muted-foreground">Avaliações atribuídas a você nos ciclos ativos.</p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma avaliação atribuída a você.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {sorted.map((a) => {
          const cycle = cycleById(a.cycle_id);
          const goToAssignment = () =>
            navigate({ to: "/evaluator/$assignmentId", params: { assignmentId: a.assignment_id } });

          return (
            <Card
              key={a.assignment_id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={goToAssignment}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
                <div className="flex items-center gap-3">
                  <PersonAvatar name={a.evaluatee_name} url={photoByEvaluatee(a.evaluatee_id)} size="lg" />
                  <div>
                    <CardTitle className="text-base">{a.evaluatee_name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Você como <strong>{a.evaluator_type_label}</strong>
                    </p>
                    {cycle && (
                      <p className="text-xs text-muted-foreground mt-0.5">{cycle.name}</p>
                    )}
                  </div>
                </div>
                <div className="text-right space-y-1">
                  {statusBadge(a.status)}
                  {a.status === "completed" && a.submitted_at && (
                    <p className="text-[11px] text-muted-foreground flex items-center justify-end gap-1">
                      <CalendarCheck2 className="h-3 w-3" /> Concluída em {formatDate(a.submitted_at)}
                    </p>
                  )}
                  {a.status !== "completed" && cycle?.end_date && (
                    <p className="text-[11px] text-muted-foreground flex items-center justify-end gap-1">
                      <CalendarClock className="h-3 w-3" /> Prazo: {formatDate(cycle.end_date)}
                    </p>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  type="button"
                  size="sm"
                  variant={a.status === "completed" ? "outline" : "default"}
                  onClick={(e) => {
                    e.stopPropagation();
                    goToAssignment();
                  }}
                >
                  {a.status === "completed" ? "Revisar" : "Avaliar"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}
