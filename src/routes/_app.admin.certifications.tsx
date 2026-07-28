import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CertificationCatalog, Person, PersonCertification } from "@/lib/db-types";

export const Route = createFileRoute("/_app/admin/certifications")({
  component: AdminCertifications,
});

function AdminCertifications() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", issuing_entity: "", bonus: "" });
  const [personId, setPersonId] = useState<string | undefined>();

  const { data: catalog } = useQuery({
    queryKey: ["certifications_catalog"],
    queryFn: async () => {
      const { data } = await supabase.from("certifications_catalog").select("*").order("name");
      return (data ?? []) as CertificationCatalog[];
    },
  });

  const { data: people } = useQuery({
    queryKey: ["all-people"],
    queryFn: async () => {
      const { data } = await supabase.from("people").select("*").eq("is_active", true).order("full_name");
      return (data ?? []) as Person[];
    },
  });

  const { data: personCerts } = useQuery({
    queryKey: ["person_certifications", personId],
    enabled: !!personId,
    queryFn: async () => {
      const { data } = await supabase.from("person_certifications").select("*").eq("person_id", personId);
      return (data ?? []) as PersonCertification[];
    },
  });

  const createCert = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error("Nome obrigatório.");
      const { error } = await supabase.from("certifications_catalog").insert({
        name: form.name, issuing_entity: form.issuing_entity || null, bonus: Number(form.bonus) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certificação criada");
      setOpen(false);
      setForm({ name: "", issuing_entity: "", bonus: "" });
      qc.invalidateQueries({ queryKey: ["certifications_catalog"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCert = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CertificationCatalog> }) => {
      const { error } = await supabase.from("certifications_catalog").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["certifications_catalog"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCert = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("certifications_catalog").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["certifications_catalog"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePersonCert = useMutation({
    mutationFn: async ({ certId, obtained }: { certId: string; obtained: boolean }) => {
      if (!personId) return;
      const existing = personCerts?.find((p) => p.certification_id === certId);
      const obtained_date = obtained ? new Date().toISOString().slice(0, 10) : null;
      if (existing) {
        const { error } = await supabase
          .from("person_certifications")
          .update({ obtained, obtained_date })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("person_certifications")
          .insert({ person_id: personId, certification_id: certId, obtained, obtained_date });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["person_certifications", personId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const hasCert = (certId: string) => !!personCerts?.find((p) => p.certification_id === certId && p.obtained);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Catálogo de certificações</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova certificação</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova certificação</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Entidade emissora</Label><Input value={form.issuing_entity} onChange={(e) => setForm({ ...form, issuing_entity: e.target.value })} /></div>
                <div><Label>Bônus</Label><Input type="number" step="0.1" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} /></div>
                <Button onClick={() => createCert.mutate()} disabled={createCert.isPending}>Criar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead className="w-32 text-right">Bônus</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {catalog?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell><Input defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && updateCert.mutate({ id: c.id, patch: { name: e.target.value } })} /></TableCell>
                  <TableCell><Input defaultValue={c.issuing_entity ?? ""} onBlur={(e) => updateCert.mutate({ id: c.id, patch: { issuing_entity: e.target.value || null } })} /></TableCell>
                  <TableCell><Input type="number" step="0.1" defaultValue={c.bonus} onBlur={(e) => Number(e.target.value) !== c.bonus && updateCert.mutate({ id: c.id, patch: { bonus: Number(e.target.value) } })} /></TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={() => deleteCert.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Certificações por pessoa</CardTitle>
          <Select value={personId} onValueChange={setPersonId}>
            <SelectTrigger className="w-[280px]"><SelectValue placeholder="Selecionar pessoa" /></SelectTrigger>
            <SelectContent>
              {people?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16"></TableHead>
                <TableHead>Certificação</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead className="w-32 text-right">Bônus</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {catalog?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Checkbox
                      checked={hasCert(c.id)}
                      disabled={!personId}
                      onCheckedChange={(v) => togglePersonCert.mutate({ certId: c.id, obtained: !!v })}
                    />
                  </TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.issuing_entity ?? "—"}</TableCell>
                  <TableCell className="text-right">{c.bonus}</TableCell>
                </TableRow>
              ))}
              {!personId && (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Selecione uma pessoa.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
