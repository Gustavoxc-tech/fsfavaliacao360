import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { Person } from "@/lib/db-types";

export const Route = createFileRoute("/_app/admin/people")({
  component: AdminPeople,
});

function AdminPeople() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", job_title: "", area: "" });

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

  return (
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
              <TableHead className="text-right">Admin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people?.map((p) => {
              const isAdminUser = p.auth_user_id ? admins?.has(p.auth_user_id) : false;
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
                  <TableCell className="text-right">
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
