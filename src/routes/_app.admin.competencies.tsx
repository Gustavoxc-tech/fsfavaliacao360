import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Competency, EvaluationCycle, Evaluatee, Person, CompetencyAssignment } from "@/lib/db-types";

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [cycleId, setCycleId] = useState<string | undefined>();
  const [evaluateeId, setEvaluateeId] = useState<string | undefined>();

  const { data } = useQuery({
    queryKey: ["all-competencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("competencies").select("*").order("display_order");
      if (error) throw error;
      return data as Competency[];
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
    queryKey: ["evaluatees-cycle", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data } = await supabase.from("evaluatees").select("*, people(full_name)").eq("cycle_id", cycleId);
      return (data ?? []) as (Evaluatee & { people: Pick<Person, "full_name"> })[];
    },
  });

  const { data: assignments } = useQuery({
    queryKey: ["competency-assignments", evaluateeId],
    enabled: !!evaluateeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("competency_assignments").select("*").eq("evaluatee_id", evaluateeId);
      if (error) throw error;
      return data as CompetencyAssignment[];
    },
  });

  const assignedCompetencyIds = useMemo(
    () => new Set((assignments ?? []).map((a) => a.competency_id)),
    [assignments]
  );

  const toggleAssignment = useMutation({
    mutationFn: async ({ competencyId, assign }: { competencyId: string; assign: boolean }) => {
      if (!evaluateeId) return;
      if (assign) {
        const { error } = await supabase.from("competency_assignments").insert({ evaluatee_id: evaluateeId, competency_id: competencyId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("competency_assignments").delete().eq("evaluatee_id", evaluateeId).eq("competency_id", competencyId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competency-assignments", evaluateeId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const setAllInCategory = useMutation({
    mutationFn: async ({ competencyIds, assign }: { competencyIds: string[]; assign: boolean }) => {
      if (!evaluateeId) return;
      if (assign) {
        const rows = competencyIds.map((id) => ({ evaluatee_id: evaluateeId, competency_id: id }));
        const { error } = await supabase.from("competency_assignments").upsert(rows, { onConflict: "evaluatee_id,competency_id" });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("competency_assignments").delete().eq("evaluatee_id", evaluateeId).in("competency_id", competencyIds);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competency-assignments", evaluateeId] }),
    onError: (e: Error) => toast.error(e.message),
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

  // Agrupa: Dimensão -> Categoria -> Competências
  const grouped = useMemo(() => {
    const byDimension = new Map<string, Map<string, Competency[]>>();
    for (const c of data ?? []) {
      if (!byDimension.has(c.dimension)) byDimension.set(c.dimension, new Map());
      const byCategory = byDimension.get(c.dimension)!;
      if (!byCategory.has(c.category)) byCategory.set(c.category, []);
      byCategory.get(c.category)!.push(c);
    }
    return byDimension;
  }, [data]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Competências (catálogo global)</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.length ?? 0} competências, agrupadas por dimensão e categoria. Clique para abrir um grupo,
            e clique numa competência para ver descrição e níveis.
          </p>
        </div>
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
              <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex: Comunicação Oral e Escrita" /></div>
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
        {grouped.size === 0 && (
          <p className="text-center text-sm text-muted-foreground py-6">Nenhuma competência cadastrada.</p>
        )}

        <Accordion type="multiple" className="w-full">
          {[...grouped.entries()].map(([dimension, categories]) => {
            const totalInDimension = [...categories.values()].reduce((s, arr) => s + arr.length, 0);
            return (
              <AccordionItem key={dimension} value={dimension}>
                <AccordionTrigger className="text-base">
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{dimension}</Badge>
                    <span className="text-muted-foreground text-sm font-normal">{totalInDimension} competências</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <Accordion type="multiple" className="w-full pl-2">
                    {[...categories.entries()].map(([category, comps]) => (
                      <AccordionItem key={category} value={category}>
                        <AccordionTrigger className="text-sm py-3">
                          <span className="flex items-center gap-2">
                            <span className="font-medium">{category}</span>
                            <span className="text-muted-foreground text-xs font-normal">{comps.length}</span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-1 pl-2">
                            {comps.map((c) => {
                              const isOpen = expanded.has(c.id);
                              const hasDetails = c.description || c.level_1_descriptor || c.level_2_descriptor
                                || c.level_3_descriptor || c.level_4_descriptor || c.level_5_descriptor;
                              return (
                                <div key={c.id} className="border rounded-md">
                                  <div
                                    className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50"
                                    onClick={() => hasDetails && toggleExpanded(c.id)}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      {hasDetails ? (
                                        isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      ) : <span className="w-4" />}
                                      <span className="text-sm font-medium truncate">{c.name}</span>
                                    </div>
                                    <Switch
                                      checked={c.is_active}
                                      onCheckedChange={(v) => toggle.mutate({ id: c.id, is_active: v })}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                  {isOpen && hasDetails && (
                                    <div className="px-3 pb-3 pt-1 space-y-2 text-sm border-t bg-muted/30">
                                      {c.description && (
                                        <p className="text-muted-foreground pt-2">{c.description}</p>
                                      )}
                                      {[1, 2, 3, 4, 5].map((n) => {
                                        const desc = c[`level_${n}_descriptor` as keyof Competency] as string | null;
                                        if (!desc) return null;
                                        return (
                                          <div key={n} className="grid grid-cols-[auto_1fr] gap-2">
                                            <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Nível {n}</span>
                                            <span className="text-xs">{desc}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-4">
        <div>
          <CardTitle className="text-base">Competências por avaliado</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Por padrão todo avaliado recebe todas as competências ativas. Use aqui para
            personalizar: desmarque o que não se aplica a essa pessoa, ou marque algo extra.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Label className="text-sm whitespace-nowrap">Ciclo:</Label>
          <Select value={cycleId} onValueChange={(v) => { setCycleId(v); setEvaluateeId(undefined); }}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Selecionar ciclo" /></SelectTrigger>
            <SelectContent>
              {cycles?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Label className="text-sm whitespace-nowrap ml-2">Avaliado:</Label>
          <Select value={evaluateeId} onValueChange={setEvaluateeId} disabled={!cycleId}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Selecionar avaliado" /></SelectTrigger>
            <SelectContent>
              {evaluatees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.people?.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {!evaluateeId && (
          <p className="text-sm text-muted-foreground text-center py-6">Selecione um ciclo e um avaliado para ver e ajustar as competências dele.</p>
        )}

        {evaluateeId && (
          <Accordion type="multiple" className="w-full">
            {[...grouped.entries()].map(([dimension, categories]) => (
              <AccordionItem key={dimension} value={dimension}>
                <AccordionTrigger className="text-base">
                  <Badge variant="outline">{dimension}</Badge>
                </AccordionTrigger>
                <AccordionContent>
                  <Accordion type="multiple" className="w-full pl-2">
                    {[...categories.entries()].map(([category, comps]) => {
                      const activeComps = comps.filter((c) => c.is_active);
                      const allChecked = activeComps.length > 0 && activeComps.every((c) => assignedCompetencyIds.has(c.id));
                      return (
                        <AccordionItem key={category} value={category}>
                          <AccordionTrigger className="text-sm py-3">
                            <span className="flex items-center gap-2">
                              <span className="font-medium">{category}</span>
                              <span className="text-muted-foreground text-xs font-normal">
                                {activeComps.filter((c) => assignedCompetencyIds.has(c.id)).length}/{activeComps.length} atribuídas
                              </span>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="pl-2 space-y-1">
                              <button
                                type="button"
                                className="text-xs text-primary underline mb-1"
                                onClick={() =>
                                  setAllInCategory.mutate({ competencyIds: activeComps.map((c) => c.id), assign: !allChecked })
                                }
                              >
                                {allChecked ? "Desmarcar todas desta categoria" : "Marcar todas desta categoria"}
                              </button>
                              {activeComps.map((c) => (
                                <label key={c.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer">
                                  <Checkbox
                                    checked={assignedCompetencyIds.has(c.id)}
                                    onCheckedChange={(checked) => toggleAssignment.mutate({ competencyId: c.id, assign: !!checked })}
                                  />
                                  <span>{c.name}</span>
                                </label>
                              ))}
                              {activeComps.length === 0 && (
                                <p className="text-xs text-muted-foreground">Nenhuma competência ativa nesta categoria.</p>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
