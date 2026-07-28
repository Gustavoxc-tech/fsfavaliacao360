import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Eye, Camera } from "lucide-react";
import { toast } from "sonner";
import { PersonProfileDrawer } from "@/components/PersonProfileDrawer";
import { PersonAvatar } from "@/components/PersonAvatar";
import { DIRETORIAS, type Diretoria, type Person, type EvaluationCycle, type Evaluatee } from "@/lib/db-types";

export const Route = createFileRoute("/_app/admin/people")({
  component: AdminPeople,
});

function AdminPeople() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePerson, setProfilePerson] = useState<Person | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", job_title: "", area: "", diretoria: "" as "" | Diretoria });
  const [cycleId, setCycleId] = useState<string | undefined>();
  const [filter, setFilter] = useState<"all" | Diretoria>("all");

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
      const payload = { ...form, diretoria: form.diretoria || null };
      const { error } = await supabase.from("people").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pessoa cadastrada");
      setOpen(false);
      setForm({ full_name: "", email: "", job_title: "", area: "", diretoria: "" });
      qc.invalidateQueries({ queryKey: ["all-people"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDiretoria = useMutation({
    mutationFn: async ({ id, diretoria }: { id: string; diretoria: Diretoria | null }) => {
      const { error } = await supabase.from("people").update({ diretoria }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-people"] }),
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

  const grouped = useMemo(() => {
    const src = (people ?? []).filter((p) => filter === "all" || p.diretoria === filter);
    const byDir: Record<string, Record<string, Person[]>> = {};
    for (const p of src) {
      const d = p.diretoria ?? "Sem diretoria";
      const g = p.area ?? "Sem gerência";
      byDir[d] ??= {};
      byDir[d][g] ??= [];
      byDir[d][g].push(p);
    }
    return byDir;
  }, [people, filter]);

  return (
    <div className="space-y-4">
      <Card className="card-hover">
        <CardContent className="py-4 flex flex-wrap items-center gap-3">
          <Label className="text-sm whitespace-nowrap">Ciclo para participação:</Label>
          <Select value={cycleId} onValueChange={setCycleId}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Selecionar ciclo" /></SelectTrigger>
            <SelectContent>
              {cycles?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Label className="text-sm ml-4 whitespace-nowrap">Diretoria:</Label>
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as diretorias</SelectItem>
              {DIRETORIAS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto">
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
                  <div>
                    <Label>Diretoria</Label>
                    <Select value={form.diretoria} onValueChange={(v) => setForm({ ...form, diretoria: v as Diretoria })}>
                      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {DIRETORIAS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Gerência (área)</Label><Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></div>
                  <Button onClick={() => create.mutate()} disabled={!form.full_name || create.isPending}>
                    {create.isPending ? "Cadastrando..." : "Cadastrar"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Accordion type="multiple" defaultValue={Object.keys(grouped)} className="space-y-3">
        {Object.entries(grouped).map(([dir, gerencias]) => {
          const count = Object.values(gerencias).reduce((a, l) => a + l.length, 0);
          return (
            <AccordionItem key={dir} value={dir} className="rounded-xl border bg-card card-hover px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center text-sm font-bold">
                    {dir.split(" ").slice(-1)[0]?.[0] ?? "?"}
                  </div>
                  <div className="text-left">
                    <div className="font-semibold">{dir}</div>
                    <div className="text-xs text-muted-foreground">{count} pessoa(s)</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                {Object.entries(gerencias).map(([ger, list]) => (
                  <div key={ger} className="mt-3 first:mt-0">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{ger}</div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>Cargo</TableHead>
                          <TableHead>Diretoria</TableHead>
                          <TableHead>Login</TableHead>
                          <TableHead>Admin</TableHead>
                          <TableHead className="text-right">Avaliado neste ciclo</TableHead>
                          <TableHead className="text-right w-[80px]">Perfil</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((p) => {
                          const isAdminUser = p.auth_user_id ? admins?.has(p.auth_user_id) : false;
                          const isEvaluatee = !!evaluateeByPerson(p.id);
                          return (
                            <TableRow key={p.id}>
                              <TableCell>
                                <AvatarCell person={p} onDone={() => qc.invalidateQueries({ queryKey: ["all-people"] })} />
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">{p.full_name}</div>
                                <div className="text-xs text-muted-foreground">{p.email ?? "—"}</div>
                              </TableCell>
                              <TableCell>{p.job_title ?? "—"}</TableCell>
                              <TableCell>
                                <Select
                                  value={p.diretoria ?? ""}
                                  onValueChange={(v) => updateDiretoria.mutate({ id: p.id, diretoria: (v || null) as Diretoria | null })}
                                >
                                  <SelectTrigger className="h-8 w-[210px]"><SelectValue placeholder="—" /></SelectTrigger>
                                  <SelectContent>
                                    {DIRETORIAS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </TableCell>
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
                              <TableCell className="text-right">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => { setProfilePerson(p); setProfileOpen(true); }}
                                  aria-label="Ver perfil"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          );
        })}
        {Object.keys(grouped).length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">Nenhuma pessoa encontrada.</div>
        )}
      </Accordion>

      <PersonProfileDrawer person={profilePerson} open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}

function AvatarCell({ person, onDone }: { person: Person; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${person.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: e2 } = await supabase.from("people").update({ avatar_url: pub.publicUrl }).eq("id", person.id);
      if (e2) throw e2;
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao enviar imagem");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="relative group">
      <PersonAvatar name={person.full_name} url={person.avatar_url} size="md" />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="absolute inset-0 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition grid place-items-center"
        aria-label="Trocar foto"
      >
        <Camera className="h-4 w-4" />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
