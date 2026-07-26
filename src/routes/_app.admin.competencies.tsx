import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { Competency } from "@/lib/db-types";

export const Route = createFileRoute("/_app/admin/competencies")({
  component: AdminCompetencies,
});

const emptyForm = {
  dimension: "Atitudes" as "Atitudes" | "Habilidades",
  category: "",
  name: "",
  description: "",
  level_1_descriptor: "",
  level_2_descriptor: "",
  level_3_descriptor: "",
  level_4_descriptor: "",
  level_5_descriptor: "",
};

function AdminCompetencies() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

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

  const create = useMutation({
    mutationFn: async () => {
      if (!form.category || !form.name) throw new Error("Preencha categoria e nome.");
      const nextOrder = (data?.length ?? 0) + 1;
      const { error } = await supabase.from("competencies").insert({
        dimension: form.dimension,
        category: form.category,
        name: form.name,
        description: form.description || null,
        level_1_descriptor: form.level_1_descriptor || null,
        level_2_descriptor: form.level_2_descriptor || null,
        level_3_descriptor: form.level_3_descriptor || null,
        level_4_descriptor: form.level_4_descriptor || null,
        level_5_descriptor: form.level_5_descriptor || null,
        display_order: nextOrder,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Competência criada");
      setOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["all-competencies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Competências (catálogo global)</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova competência</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova competência</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Dimensão</Label>
                <Select value={form.dimension} onValueChange={(v) => setForm({ ...form, dimension: v as "Atitudes" | "Habilidades" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Atitudes">Atitudes</SelectItem>
                    <SelectItem value="Habilidades">Habilidades</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex: Comunicação" /></div>
              <div><Label>Nome da competência</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Descrição (opcional)</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs text-muted-foreground">Descreva o comportamento esperado em cada nível (aparece pro avaliador escolher a nota).</p>
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n}>
                    <Label>Nível {n}</Label>
                    <Textarea
                      rows={2}
                      value={form[`level_${n}_descriptor` as keyof typeof form] as string}
                      onChange={(e) => setForm({ ...form, [`level_${n}_descriptor`]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>Criar competência</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          {data?.length ?? 0} competências cadastradas. Desative as que não devem entrar em nenhuma avaliação —
          para escolher competências específicas por colaborador, use a aba "Por avaliado" (se disponível) ou
          fale com o admin sobre atribuições individuais.
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
            {(!data || data.length === 0) && (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Nenhuma competência cadastrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
