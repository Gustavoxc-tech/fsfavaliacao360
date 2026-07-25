import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AcademicLevel, Person, PersonAcademicQualification } from "@/lib/db-types";

export const Route = createFileRoute("/_app/admin/academic")({
  component: AdminAcademic,
});

function AdminAcademic() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", evidence_required: "", score: "", order_index: "0" });

  const { data: levels } = useQuery({
    queryKey: ["academic_levels"],
    queryFn: async () => {
      const { data } = await supabase.from("academic_levels").select("*").order("order_index");
      return (data ?? []) as AcademicLevel[];
    },
  });

  const { data: people } = useQuery({
    queryKey: ["all-people"],
    queryFn: async () => {
      const { data } = await supabase.from("people").select("*").eq("is_active", true).order("full_name");
      return (data ?? []) as Person[];
    },
  });

  const { data: current } = useQuery({
    queryKey: ["paq-current"],
    queryFn: async () => {
      const { data } = await supabase.from("person_academic_qualifications").select("*").eq("is_current", true);
      return (data ?? []) as PersonAcademicQualification[];
    },
  });

  const createLevel = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error("Nome obrigatório.");
      const { error } = await supabase.from("academic_levels").insert({
        name: form.name,
        description: form.description || null,
        evidence_required: form.evidence_required || null,
        score: Number(form.score) || 0,
        order_index: Number(form.order_index) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nível criado");
      setOpen(false);
      setForm({ name: "", description: "", evidence_required: "", score: "", order_index: "0" });
      qc.invalidateQueries({ queryKey: ["academic_levels"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateLevel = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AcademicLevel> }) => {
      const { error } = await supabase.from("academic_levels").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academic_levels"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLevel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("academic_levels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academic_levels"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const setCurrent = useMutation({
    mutationFn: async ({ personId, levelId }: { personId: string; levelId: string | null }) => {
      await supabase.from("person_academic_qualifications")
        .update({ is_current: false })
        .eq("person_id", personId)
        .eq("is_current", true);
      if (levelId) {
        const { error } = await supabase.from("person_academic_qualifications").insert({
          person_id: personId, academic_level_id: levelId, is_current: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paq-current"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const currentByPerson = (pid: string) => current?.find((c) => c.person_id === pid)?.academic_level_id;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Catálogo de níveis acadêmicos</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo nível</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo nível</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div><Label>Comprovação exigida</Label><Input value={form.evidence_required} onChange={(e) => setForm({ ...form, evidence_required: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Pontuação</Label><Input type="number" step="0.5" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} /></div>
                  <div><Label>Ordem</Label><Input type="number" value={form.order_index} onChange={(e) => setForm({ ...form, order_index: e.target.value })} /></div>
                </div>
                <Button onClick={() => createLevel.mutate()} disabled={createLevel.isPending}>Criar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Ordem</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Comprovação</TableHead>
                <TableHead className="w-24 text-right">Pontuação</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {levels?.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.order_index}</TableCell>
                  <TableCell>
                    <Input defaultValue={l.name} onBlur={(e) => e.target.value !== l.name && updateLevel.mutate({ id: l.id, patch: { name: e.target.value } })} />
                  </TableCell>
                  <TableCell><Input defaultValue={l.description ?? ""} onBlur={(e) => updateLevel.mutate({ id: l.id, patch: { description: e.target.value || null } })} /></TableCell>
                  <TableCell><Input defaultValue={l.evidence_required ?? ""} onBlur={(e) => updateLevel.mutate({ id: l.id, patch: { evidence_required: e.target.value || null } })} /></TableCell>
                  <TableCell><Input type="number" step="0.5" defaultValue={l.score} onBlur={(e) => Number(e.target.value) !== l.score && updateLevel.mutate({ id: l.id, patch: { score: Number(e.target.value) } })} /></TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={() => deleteLevel.mutate(l.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Nível atual por pessoa</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead className="w-96">Nível atual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.full_name}</TableCell>
                  <TableCell>
                    <Select
                      value={currentByPerson(p.id) ?? ""}
                      onValueChange={(v) => setCurrent.mutate({ personId: p.id, levelId: v || null })}
                    >
                      <SelectTrigger><SelectValue placeholder="Sem nível" /></SelectTrigger>
                      <SelectContent>
                        {levels?.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} ({l.score})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
