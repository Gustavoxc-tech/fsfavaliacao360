import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
  );
}
