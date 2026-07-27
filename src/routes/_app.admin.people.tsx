import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Eye } from "lucide-react";
import { toast } from "sonner";
import { PersonProfileDrawer } from "@/components/PersonProfileDrawer";
import type { Person, EvaluationCycle, Evaluatee } from "@/lib/db-types";

export const Route = createFileRoute("/_app/admin/people")({
  component: AdminPeople,
});

function AdminPeople() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", job_title: "", area: "" });
  const [cycleId, setCycleId] = useState<string | undefined>();

  const { data: people } = useQuery({
    queryKey: ["all-people"],
    queryFn: async () => {
      const { data, error } = await supabase.from("people").select("*").order("full_name");
      if (error) throw error;
      return data as Person[];
    },
  });

  const { data: admins } = useQuery({
    queryKey: ["admins"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.user_id));
    },
  });

  const { data: cycles } = useQuery({
    queryKey: ["cycles"],
    queryFn: async () => {
      const { data } = await supabase.from("evaluation_cycles").select("*").order("start_date", { ascending: false });
      return (data ?? []) as EvaluationCycle[];
    },
  });

  useEffect(() => {
    if (!cycleId && cycles && cycles.length) {
      const openCycle = cycles.find((c) => c.status === "open");
      setCycleId(openCycle?.id ?? cycles[0].id);
    }
  }, [cycles, cycleId]);

  // Quem já é avaliado no ciclo selecionado (fonte única de verdade —
  // essa mesma lista é usada pela tela de Atribuições)
  const { data: evaluatees } = useQuery({
    queryKey: ["evaluatees-by-cycle", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data } = await supabase.from("evaluatees").select("*").eq("cycle_id", cycleId);
      return (data ?? []) as Evaluatee[];
    },
  });

  const evaluateeByPerson = (personId: string) => evaluatees?.find((e) => e.person_id === personId);

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("people").insert({ ...form });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pessoa cadastrada");
      setOpen(false);
      setForm({ full_name: "", email: "", job_title: "", area: "" });
      qc.invalidateQueries({ queryKey: ["all-people"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAdmin = useMutation({
    mutationFn: async ({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) => {
      if (makeAdmin) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admins"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Liga/desliga a participação da pessoa como avaliada no ciclo selecionado.
  // Isso substitui o botão "Adicionar avaliado" que existia (duplicado) na
  // tela de Atribuições.
  const toggleEvaluatee = useMutation({
    mutationFn: async ({ person, isEvaluatee }: { person: Person; isEvaluatee: boolean }) => {
      if (!cycleId) return;
      if (isEvaluatee) {
        const { error } = await supabase.from("evaluatees").insert({
          cycle_id: cycleId,
          person_id: person.id,
          job_title: person.job_title,
          area: person.area,
        });
        if (error) throw error;
      } else {
        const ev = evaluateeByPerson(person.id);
        if (!ev) return;
        const { error } = await supabase.from("evaluatees").delete().eq("id", ev.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evaluatees-by-cycle", cycleId] });
      qc.invalidateQueries({ queryKey: ["assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 flex items-center gap-3">
          <Label className="text-sm whitespace-nowrap">Ciclo para participação:</Label>
          <Select value={cycleId} onValueChange={setCycleId}>
            <SelectTrigger className="w-[300px]"><SelectValue placeholder="Selecionar ciclo" /></SelectTrigger>
            <SelectContent>
              {cycles?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground ml-2">
            Use a coluna "Avaliado neste ciclo" para decidir quem participa. Depois, vá em
            Atribuições para definir quem avalia cada um.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-6 space-y-4">
          <div className="flex justify-end">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova pessoa</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Cadastrar pessoa</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Nome completo</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>Cargo</Label><Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></div>
                  <div><Label>Área</Label><Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></div>
                  <Button onClick={() => create.mutate()} disabled={!form.full_name || create.isPending}>Cadastrar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead className="text-right">Avaliado neste ciclo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people?.map((p) => {
                const isAdminUser = p.auth_user_id ? admins?.has(p.auth_user_id) : false;
                const isEvaluatee = !!evaluateeByPerson(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.full_name}</TableCell>
                    <TableCell>{p.email}</TableCell>
                    <TableCell>{p.job_title ?? "—"}</TableCell>
                    <TableCell>{p.area ?? "—"}</TableCell>
                    <TableCell>
                      {p.auth_user_id
                        ? <Badge variant="default">Ativo</Badge>
                        : <Badge variant="outline">Não vinculado</Badge>}
                    </TableCell>
                    <TableCell>
                      {p.auth_user_id ? (
                        <Button
                          size="sm"
                          variant={isAdminUser ? "default" : "outline"}
                          onClick={() => toggleAdmin.mutate({ userId: p.auth_user_id!, makeAdmin: !isAdminUser })}
                        >
                          {isAdminUser ? "Admin" : "Tornar admin"}
                        </Button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        disabled={!cycleId || toggleEvaluatee.isPending}
                        checked={isEvaluatee}
                        onCheckedChange={(checked) => toggleEvaluatee.mutate({ person: p, isEvaluatee: checked })}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!people || people.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">Nenhuma pessoa cadastrada.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
