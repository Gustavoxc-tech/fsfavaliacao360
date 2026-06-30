import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Competency } from "@/lib/db-types";

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
    <Card>
      <CardContent className="py-6">
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
  );
}
