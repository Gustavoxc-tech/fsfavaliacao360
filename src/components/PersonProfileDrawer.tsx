import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis as PolarAxis2,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import type {
  Person,
  EvaluationCycle,
  VCompetencyResult,
  VPersonFinalScore,
} from "@/lib/db-types";

function fmt(v: number | null | undefined) {
  return v == null ? "—" : Number(v).toFixed(2);
}

export function PersonProfileDrawer({
  person,
  open,
  onOpenChange,
}: {
  person: Person | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [cycleId, setCycleId] = useState<string | undefined>();

  useEffect(() => {
    if (!open) setCycleId(undefined);
  }, [open]);

  const { data: cycles } = useQuery({
    queryKey: ["profile-cycles", person?.id],
    enabled: !!person?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("v_person_final_score")
        .select("cycle_id")
        .eq("evaluatee_person_id", person!.id);
      const ids = [...new Set((data ?? []).map((r: any) => r.cycle_id))];
      if (!ids.length) return [];
      const { data: cs } = await supabase
        .from("evaluation_cycles")
        .select("*")
        .in("id", ids)
        .order("start_date", { ascending: false });
      return (cs ?? []) as EvaluationCycle[];
    },
  });

  const effective = cycleId ?? cycles?.[0]?.id;

  const { data: overall } = useQuery({
    queryKey: ["profile-overall", person?.id, effective],
    enabled: !!person?.id && !!effective,
    queryFn: async () => {
      const { data } = await supabase
        .from("v_person_final_score")
        .select("*")
        .eq("evaluatee_person_id", person!.id)
        .eq("cycle_id", effective)
        .maybeSingle();
      return data as VPersonFinalScore | null;
    },
  });

  const { data: byComp } = useQuery({
    queryKey: ["profile-comp", person?.id, effective],
    enabled: !!person?.id && !!effective,
    queryFn: async () => {
      const { data } = await supabase
        .from("v_competency_results")
        .select("*")
        .eq("evaluatee_person_id", person!.id)
        .eq("cycle_id", effective);
      return (data ?? []) as VCompetencyResult[];
    },
  });

  const { data: academic } = useQuery({
    queryKey: ["profile-academic", person?.id],
    enabled: !!person?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("person_academic_qualifications")
        .select("is_current, academic_levels(name, score)")
        .eq("person_id", person!.id)
        .eq("is_current", true);
      return data ?? [];
    },
  });

  const { data: certs } = useQuery({
    queryKey: ["profile-certs", person?.id],
    enabled: !!person?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("person_certifications")
        .select("obtained, certifications_catalog(name, bonus)")
        .eq("person_id", person!.id)
        .eq("obtained", true);
      return data ?? [];
    },
  });

  const dimensionData = useMemo(() => {
    const groups: Record<string, { total: number; count: number }> = {};
    for (const r of byComp ?? []) {
      const v = r.weighted_result;
      if (v == null) continue;
      if (!groups[r.dimension]) groups[r.dimension] = { total: 0, count: 0 };
      groups[r.dimension].total += Number(v);
      groups[r.dimension].count += 1;
    }
    return Object.entries(groups).map(([dimension, g]) => ({
      dimension,
      nota: g.count ? g.total / g.count : 0,
    }));
  }, [byComp]);

  // LÓGICA NOVA: Transforma os dados para a Matriz (Eixo X = Habilidades, Eixo Y = Atitudes)
  const scatterData = useMemo(() => {
    let atitudes = 0;
    let habilidades = 0;
    dimensionData.forEach((d) => {
      const dim = d.dimension.toLowerCase();
      if (dim.includes("atitude")) atitudes = d.nota;
      if (dim.includes("habilidade")) habilidades = d.nota;
    });
    return [{ name: "Avaliado", atitudes, habilidades }];
  }, [dimensionData]);

  const finalScore = overall?.overall_final_score ?? null;
  const radialData = [
    {
      name: "Final",
      value: finalScore ?? 0,
      fill: "var(--primary)",
    },
  ];

  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadAvatar = async (file: File) => {
    if (!person) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${person.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: upErr } = await supabase
        .from("people")
        .update({ avatar_url: pub.publicUrl })
        .eq("id", person.id);
      if (upErr) throw upErr;
      toast.success("Foto atualizada");
      qc.invalidateQueries({ queryKey: ["all-people"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Perfil do avaliado</SheetTitle>
        </SheetHeader>

        {person && (
          <div className="mt-6 space-y-6 animate-in fade-in-50 duration-200">
            <div className="flex items-center gap-4">
              <div className="relative">
                <PersonAvatar name={person.full_name} url={person.avatar_url} size="xl" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center shadow hover:bg-primary/90 transition"
                  aria-label="Trocar foto"
                  disabled={uploading}
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadAvatar(f);
                    e.target.value = "";
                  }}
                />
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate">{person.full_name}</div>
                <div className="text-sm text-muted-foreground truncate">
                  {person.job_title ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {person.diretoria ?? "—"} {person.area ? `• ${person.area}` : ""}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(academic ?? []).map((a: any, i) => (
                <Badge key={`ac-${i}`} variant="secondary">
                  🎓 {a.academic_levels?.name}
                </Badge>
              ))}
              {(certs ?? []).map((c: any, i) => (
                <Badge key={`ct-${i}`} variant="outline">
                  ✓ {c.certifications_catalog?.name}
                </Badge>
              ))}
              {!(academic?.length || certs?.length) && (
                <span className="text-xs text-muted-foreground">
                  Sem qualificações ou certificações registradas.
                </span>
              )}
            </div>

            {cycles && cycles.length > 0 ? (
              <>
                <Select value={effective} onValueChange={setCycleId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecionar ciclo" />
                  </SelectTrigger>
                  <SelectContent>
                    {cycles.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="rounded-lg border bg-card p-4">
                  <div className="text-xs text-muted-foreground mb-2">
                    Nota Final Geral
                  </div>
                  <div className="relative h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart
                        innerRadius="70%"
                        outerRadius="100%"
                        data={radialData}
                        startAngle={90}
                        endAngle={-270}
                      >
                        <PolarAxis2
                          type="number"
                          domain={[0, 5]}
                          angleAxisId={0}
                          tick={false}
                        />
                        <RadialBar
                          background={{ fill: "var(--muted)" }}
                          dataKey="value"
                          cornerRadius={8}
                          isAnimationActive
                          animationDuration={900}
                        />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-primary">
                          {fmt(finalScore)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          de 5,00
                        </div>
                      </div>
                    </div>
                  </div>
                  {overall && (
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <MiniBlock label="Competências" v={overall.competencies_score} />
                      <MiniBlock label="Metas" v={overall.goals_final_score} />
                      <MiniBlock label="Qualificação" v={overall.academic_final_score} />
                      <MiniBlock label="Certificação" v={overall.certification_final_score} />
                    </div>
                  )}
                </div>

                {/* NOVO GRÁFICO: Matriz de Quadrantes (ScatterChart) */}
                {dimensionData.length > 0 ? (
                  <div className="rounded-lg border bg-card p-4">
                    <div className="text-xs text-muted-foreground mb-4 font-medium">
                      Matriz Atitudes vs Habilidades
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 10, right: 15, bottom: 20, left: -20 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          
                          <XAxis 
                            type="number" 
                            dataKey="habilidades" 
                            name="Habilidades" 
                            domain={[0, 5]} 
                            tickCount={6} 
                            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
                          />
                          <YAxis 
                            type="number" 
                            dataKey="atitudes" 
                            name="Atitudes" 
                            domain={[0, 5]} 
                            tickCount={6} 
                            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
                          />
                          
                          <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            formatter={(value: number, name: string) => [`${value.toFixed(2)}`, name]}
                            contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', fontSize: '12px' }}
                          />

                          {/* Zonas Coloridas */}
                          <ReferenceArea x1={0} x2={2.5} y1={0} y2={2.5} fill="#fee2e2" fillOpacity={0.4} />
                          <ReferenceArea x1={2.5} x2={5} y1={0} y2={2.5} fill="#fef08a" fillOpacity={0.3} />
                          <ReferenceArea x1={0} x2={2.5} y1={2.5} y2={5} fill="#bfdbfe" fillOpacity={0.3} />
                          <ReferenceArea x1={2.5} x2={5} y1={2.5} y2={5} fill="#bbf7d0" fillOpacity={0.4} />
                          
                          {/* Linhas Divisórias */}
                          <ReferenceLine x={2.5} stroke="hsl(var(--muted-foreground))" opacity={0.5} />
                          <ReferenceLine y={2.5} stroke="hsl(var(--muted-foreground))" opacity={0.5} />
                          
                          {/* Ponto do Colaborador */}
                          <Scatter name="Colaborador" data={scatterData} fill="var(--primary)" shape="circle" r={8} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                    
                    {/* Legenda Opcional para o Contexto de Cores */}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-green-200 rounded-sm"></span> Alto Desempenho</div>
                      <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-blue-200 rounded-sm"></span> Treinar Habilidades</div>
                      <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-yellow-200 rounded-sm"></span> Foco em Atitudes</div>
                      <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red-200 rounded-sm"></span> Zona de Risco</div>
                    </div>
                  </div>
                ) : (
                  <EmptyBlock text="Ainda sem competências avaliadas neste ciclo." />
                )}
              </>
            ) : (
              <EmptyBlock text="Ainda sem avaliação em nenhum ciclo." />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MiniBlock({ label, v }: { label: string; v: number | null }) {
  return (
    <div className="rounded-md bg-secondary/60 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-base font-semibold text-foreground">{fmt(v)}</div>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}