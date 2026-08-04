import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarClock, CalendarCheck2, HelpCircle } from "lucide-react";
import type { VAssignmentProgress, EvaluationCycle } from "@/lib/db-types";

export const Route = createFileRoute("/_app/evaluator/")({
  component: EvaluatorList,
});

// Pendente/Em Andamento primeiro (precisam de ação), Concluída por último
const STATUS_ORDER: Record<string, number> = { pending: 0, in_progress: 1, completed: 2 };

// Frase explicativa de cada tipo de avaliador, para não deixar dúvida sobre o
// papel que a pessoa está exercendo naquela avaliação específica.
const EVALUATOR_TYPE_INFO: Record<string, { short: string; full: string }> = {
  gestor: {
    short: "Você está avaliando como Gestor(a) desta pessoa.",
    full: "Gestor: quem lidera diretamente essa pessoa no dia a dia de trabalho.",
  },
  pares: {
    short: "Você está avaliando como Par — colega que trabalha com essa pessoa.",
    full: "Pares: colegas que trabalham lado a lado com a pessoa avaliada.",
  },
  subordinados: {
    short: "Você está avaliando como Subordinado(a) desta pessoa.",
    full: "Subordinados: pessoas lideradas diretamente pelo avaliado, avaliando a liderança dele(a).",
  },
  autoavaliacao: {
    short: "Esta é a sua Autoavaliação.",
    full: "Autoavaliação: a própria pessoa avaliando o seu desempenho.",
  },
};

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Minhas Avaliações</h1>
          <p className="text-sm text-muted-foreground">Avaliações atribuídas a você nos ciclos ativos.</p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground shrink-0">
              <HelpCircle className="h-4 w-4 mr-1" /> O que significa cada papel?
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <p className="text-sm font-semibold mb-2">Papéis de avaliador</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {Object.values(EVALUATOR_TYPE_INFO).map((info) => (
                <li key={info.full}>{info.full}</li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma avaliação atribuída a você.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4" data-tour="eval-list">
        {sorted.map((a) => {
          const cycle = cycleById(a.cycle_id);
          const roleInfo = EVALUATOR_TYPE_INFO[a.evaluator_type_code];
          const goToAssignment = () =>
            navigate({ to: "/evaluator/$assignmentId", params: { assignmentId: a.assignment_id } });

          return (
            <Card
              key={a.assignment_id}
              data-tour="eval-card"
              data-assignment-id={a.assignment_id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={goToAssignment}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
                <div className="flex items-center gap-3">
                  <PersonAvatar name={a.evaluatee_name} url={photoByEvaluatee(a.evaluatee_id)} size="lg" />
                  <div>
                    <CardTitle className="text-base">{a.evaluatee_name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {roleInfo?.short ?? (
                        <>Você como <strong>{a.evaluator_type_label}</strong></>
                      )}
                    </p>
                    {cycle && (
                      <p className="text-xs text-muted-foreground mt-0.5">{cycle.name}</p>
                    )}
                  </div>
                </div>
                <div className="text-right space-y-1" data-tour="eval-status">
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
                  data-tour="eval-action"
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
