import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { VAssignmentProgress } from "@/lib/db-types";

export const Route = createFileRoute("/_app/evaluator")({
  component: EvaluatorList,
});

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
        .eq("evaluator_person_id", person!.id)
        .order("status", { ascending: true });
      if (error) throw error;
      return data as VAssignmentProgress[];
    },
  });

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
        {data?.map((a) => (
          <Card key={a.assignment_id}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
              <div>
                <CardTitle className="text-base">{a.evaluatee_name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Você como <strong>{a.evaluator_type_label}</strong>
                </p>
              </div>
              <Badge variant={a.status === "completed" ? "default" : a.status === "in_progress" ? "secondary" : "outline"}>
                {a.status === "completed" ? "Concluída" : a.status === "in_progress" ? "Em andamento" : "Pendente"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{a.scores_filled} de {a.total_competencies} competências</span>
                  <span>{a.pct_complete}%</span>
                </div>
                <Progress value={a.pct_complete} />
              </div>
              <Button
                type="button"
                size="sm"
                variant={a.status === "completed" ? "outline" : "default"}
                onClick={() => {
                  console.log("[debug] clique em Avaliar", a.assignment_id);
                  navigate({ to: "/evaluator/$assignmentId", params: { assignmentId: a.assignment_id } });
                }}
              >
                {a.status === "completed" ? "Revisar" : "Avaliar"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
