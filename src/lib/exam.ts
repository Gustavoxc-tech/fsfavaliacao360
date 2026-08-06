import type { KnowledgeExam, KnowledgeExamWeightConfig } from "@/lib/db-types";

export const DEFAULT_EXAM_SUBWEIGHTS = {
  sector: 0.3334,
  specific: 0.3333,
  internal: 0.3333,
};

export const DEFAULT_BLOCK_WEIGHTS = {
  competencies: 0.6,
  goals: 0.2,
  academic: 0.05,
  certification: 0.05,
  knowledgeExam: 0.1,
};

export function examSubWeights(cfg: KnowledgeExamWeightConfig | null | undefined) {
  return cfg
    ? {
        sector: Number(cfg.sector_legislation_weight),
        specific: Number(cfg.specific_legislation_weight),
        internal: Number(cfg.internal_norms_weight),
      }
    : { ...DEFAULT_EXAM_SUBWEIGHTS };
}

/**
 * Nota final da Prova de Conhecimentos, na escala de 0 a 5.
 * Média ponderada das 3 notas (0 a 10, ponderando só as preenchidas) ÷ 2.
 */
export function computeExamScore(
  exam: KnowledgeExam | null | undefined,
  cfg: KnowledgeExamWeightConfig | null | undefined,
): number | null {
  if (!exam) return null;
  const w = examSubWeights(cfg);
  const parts = [
    { v: exam.sector_legislation_score, w: w.sector },
    { v: exam.specific_legislation_score, w: w.specific },
    { v: exam.internal_norms_score, w: w.internal },
  ].filter((p) => p.v != null);
  const totalWeight = parts.reduce((s, p) => s + p.w, 0);
  if (parts.length === 0 || totalWeight <= 0) return null;
  const weighted = parts.reduce((s, p) => s + Number(p.v) * p.w, 0);
  return weighted / totalWeight / 2;
}

/** Média ponderada apenas dos blocos que já têm nota. */
export function weightedOverall(parts: { score: number | null; weight: number }[]): number | null {
  const totalWeight = parts.reduce((s, p) => s + (p.score != null ? Number(p.weight) : 0), 0);
  if (totalWeight <= 0) return null;
  const totalWeighted = parts.reduce((s, p) => s + (p.score != null ? Number(p.score) * Number(p.weight) : 0), 0);
  return totalWeighted / totalWeight;
}
