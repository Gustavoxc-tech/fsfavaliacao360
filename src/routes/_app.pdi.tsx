import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";
import { ClipboardCheck, Plus, Trash2 } from "lucide-react";
import type { Competency, DevelopmentPlan, DevelopmentPlanItem, EvaluationCycle, Person } from "@/lib/db-types";

export const Route = createFileRoute("/_app/pdi")({
  component: PdiPage,
});

const STATUS_META: Record<DevelopmentPlan["status"], { label: string; variant: "secondary" | "default" | "outline" }> = {
  pendente_cadastro: { label: "Pendente de Cadastro", variant: "outline" },
  em_andamento: { label: "Em Andamento", variant: "default" },
  concluido: { label: "Concluído", variant: "secondary" },
};

function StatusBadge({ status }: { status: DevelopmentPlan["status"] }) {
  const meta = STATUS_META[status] ?? STATUS_META.pendente_cadastro;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function PdiPage() {
  const { isAdmin, person } = useAuth();
  const qc = useQueryClient();
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);

  const { data: cycles } = useQuery({
    queryKey: ["cycles"],
    queryFn: async () => {
      const { data } = await supabase.from("evaluation_cycles").select("*").order("start_date", { ascending: false });
      return (data ?? []) as EvaluationCycle[];
    },
  });

  // Gatilho automático: garante os PDIs de cada ciclo (função idempotente no banco)
  const cycleIds = useMemo(() => (cycles ?? []).map((c) => c.id).join(","), [cycles]);
  useEffect(() => {
    if (!cycleIds) return;
    (async () => {
      for (const id of cycleIds.split(",")) {
        await supabase.rpc("generate_pdi_for_cycle", { _cycle_id: id });
      }
      qc.invalidateQueries({ queryKey: ["pdi-plans"] });
    })();
  }, [cycleIds, qc]);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["pdi-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("development_plans")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DevelopmentPlan[];
    },
  });

  const { data: people } = useQuery({
    queryKey: ["all-people"],
    queryFn: async () => {
      const { data } = await supabase.from("people").select("*");
      return (data ?? []) as Person[];
    },
  });

  const peopleMap = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);
  const cycleMap = useMemo(() => new Map((cycles ?? []).map((c) => [c.id, c])), [cycles]);

  const visiblePlans = useMemo(() => {
    const list = plans ?? [];
    if (isAdmin) return list;
    return list.filter((p) => p.person_id === person?.id);
  }, [plans, isAdmin, person?.id]);

  const openPlan = visiblePlans.find((p) => p.id === openPlanId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Plano de Desenvolvimento Individual</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Gestão dos PDIs detectados automaticamente a partir dos resultados das avaliações."
            : "Acompanhe seu plano de desenvolvimento."}
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {!isLoading && visiblePlans.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <ClipboardCheck className="mx-auto mb-3 h-8 w-8 opacity-40" />
            Nenhum Plano de Desenvolvimento Individual no momento.
          </CardContent>
        </Card>
      )}

      {!isAdmin && visiblePlans.map((p) => (
        <CollaboratorPlanCard key={p.id} plan={p} cycleName={cycleMap.get(p.cycle_id)?.name ?? "—"} />
      ))}

      {isAdmin && visiblePlans.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Ciclo</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePlans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{peopleMap.get(p.person_id)?.full_name ?? "—"}</TableCell>
                    <TableCell>{cycleMap.get(p.cycle_id)?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.period ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setOpenPlanId(p.id)}>Abrir</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Sheet open={!!openPlan} onOpenChange={(o) => !o && setOpenPlanId(null)}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          {openPlan && (
            <PlanEditor
              plan={openPlan}
              person={peopleMap.get(openPlan.person_id) ?? null}
              cycleName={cycleMap.get(openPlan.cycle_id)?.name ?? "—"}
              onClose={() => setOpenPlanId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function usePlanItems(planId: string) {
  return useQuery({
    queryKey: ["pdi-items", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("development_plan_items")
        .select("*, competencies(name, dimension)")
        .eq("plan_id", planId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as (DevelopmentPlanItem & { competencies: { name: string; dimension: string } | null })[];
    },
  });
}

function CollaboratorPlanCard({ plan, cycleName }: { plan: DevelopmentPlan; cycleName: string }) {
  const { data: items } = usePlanItems(plan.id);

  return (
    <Card className="card-hover">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Ciclo {cycleName}</CardTitle>
          <CardDescription>{plan.period ?? "Período a definir"}</CardDescription>
        </div>
        <StatusBadge status={plan.status} />
      </CardHeader>
      <CardContent>
        {plan.status === "pendente_cadastro" ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Você tem um Plano de Desenvolvimento Individual pendente — aguardando cadastro pelo seu gestor.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competência</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Nota Atual</TableHead>
                <TableHead>Meta</TableHead>
                <TableHead>Ação de Desenvolvimento</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Prazo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(items ?? []).map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">{it.competencies?.name ?? "—"}</TableCell>
                  <TableCell>{it.category ?? "—"}</TableCell>
                  <TableCell>{it.current_score ?? "—"}</TableCell>
                  <TableCell>{it.target_score ?? "—"}</TableCell>
                  <TableCell className="whitespace-pre-wrap">{it.action ?? "—"}</TableCell>
                  <TableCell>{it.responsible ?? "—"}</TableCell>
                  <TableCell>{it.due_date ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PlanEditor({
  plan,
  person,
  cycleName,
  onClose,
}: {
  plan: DevelopmentPlan;
  person: Person | null;
  cycleName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: items } = usePlanItems(plan.id);
  const [period, setPeriod] = useState(plan.period ?? "");
  const [drafts, setDrafts] = useState<Record<string, Partial<DevelopmentPlanItem>>>({});
  const [saving, setSaving] = useState(false);
  const [newCompetency, setNewCompetency] = useState<string | undefined>();

  const { data: competencies } = useQuery({
    queryKey: ["competencies-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("competencies")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      return (data ?? []) as Competency[];
    },
  });

  const used = new Set((items ?? []).map((i) => i.competency_id));
  const available = (competencies ?? []).filter((c) => !used.has(c.id));

  const value = <K extends keyof DevelopmentPlanItem>(it: DevelopmentPlanItem, key: K) =>
    (drafts[it.id]?.[key] ?? it[key] ?? "") as string;

  const setValue = (id: string, key: keyof DevelopmentPlanItem, v: unknown) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: v } }));

  const save = async (nextStatus?: DevelopmentPlan["status"]) => {
    setSaving(true);
    try {
      for (const it of items ?? []) {
        const d = drafts[it.id];
        if (!d) continue;
        const payload = {
          target_score: d.target_score === "" || d.target_score === undefined ? it.target_score : Number(d.target_score),
          action: (d.action ?? it.action) || null,
          responsible: (d.responsible ?? it.responsible) || null,
          due_date: (d.due_date ?? it.due_date) || null,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from("development_plan_items").update(payload).eq("id", it.id);
        if (error) throw error;
      }

      const merged = (items ?? []).map((it) => ({ ...it, ...drafts[it.id] }));
      const anyFilled = merged.some(
        (it) => it.target_score != null || it.action || it.responsible || it.due_date,
      );
      const status =
        nextStatus ?? (plan.status === "concluido" ? "concluido" : anyFilled ? "em_andamento" : "pendente_cadastro");

      const { data: auth } = await supabase.auth.getUser();
      const { error: planErr } = await supabase
        .from("development_plans")
        .update({
          period: period || null,
          status,
          updated_by: auth.user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", plan.id);
      if (planErr) throw planErr;

      setDrafts({});
      await qc.invalidateQueries({ queryKey: ["pdi-plans"] });
      await qc.invalidateQueries({ queryKey: ["pdi-items", plan.id] });
      toast.success("PDI salvo.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addCompetency = async () => {
    if (!newCompetency) return;
    const { error } = await supabase.from("development_plan_items").insert({
      plan_id: plan.id,
      competency_id: newCompetency,
      category: "Oportunidade de Melhoria",
      source: "manual",
    });
    if (error) return toast.error(error.message);
    setNewCompetency(undefined);
    await qc.invalidateQueries({ queryKey: ["pdi-items", plan.id] });
  };

  const removeItem = async (id: string) => {
    const { error } = await supabase.from("development_plan_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["pdi-items", plan.id] });
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{person?.full_name ?? "PDI"}</SheetTitle>
        <SheetDescription>
          {person?.job_title ?? "—"} · Ciclo {cycleName}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-4 space-y-6">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="pdi-period">Período do PDI</Label>
            <Input
              id="pdi-period"
              value={period}
              placeholder="Ex.: Jan/2026 a Jun/2026"
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>
          <StatusBadge status={plan.status} />
        </div>

        <div className="space-y-3">
          {(items ?? []).map((it) => (
            <Card key={it.id}>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{it.competencies?.name ?? "Competência"}</div>
                    <div className="text-xs text-muted-foreground">
                      {it.category ?? "—"} · Nota atual: {it.current_score ?? "—"} ·{" "}
                      {it.source === "auto" ? "Automático" : "Adicionado manualmente"}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeItem(it.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Meta (0–5)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={5}
                      step="0.1"
                      value={value(it, "target_score")}
                      onChange={(e) => setValue(it.id, "target_score", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Responsável</Label>
                    <Input
                      value={value(it, "responsible")}
                      onChange={(e) => setValue(it.id, "responsible", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Prazo</Label>
                    <Input
                      type="date"
                      value={value(it, "due_date")}
                      onChange={(e) => setValue(it.id, "due_date", e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Ação de Desenvolvimento</Label>
                  <Textarea
                    rows={2}
                    value={value(it, "action")}
                    onChange={(e) => setValue(it.id, "action", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label>Adicionar competência ao plano</Label>
            <Select value={newCompetency} onValueChange={setNewCompetency}>
              <SelectTrigger><SelectValue placeholder="Selecionar competência" /></SelectTrigger>
              <SelectContent>
                {available.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={addCompetency} disabled={!newCompetency}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>

        <div className="flex gap-2 pb-8">
          <Button onClick={() => save()} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
          <Button variant="secondary" onClick={() => save("concluido")} disabled={saving}>
            Marcar como Concluído
          </Button>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </>
  );
}
