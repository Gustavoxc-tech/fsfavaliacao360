export type AppRole = "admin" | "user";

export interface Competency {
  id: string;
  dimension: "Atitudes" | "Habilidades";
  category: string;
  name: string;
  description: string | null;
  level_1_descriptor: string | null;
  level_2_descriptor: string | null;
  level_3_descriptor: string | null;
  level_4_descriptor: string | null;
  level_5_descriptor: string | null;
  display_order: number;
  is_active: boolean;
}

export interface EvaluatorType {
  id: string;
  code: "gestor" | "pares" | "subordinados" | "autoavaliacao";
  label: string;
  weight: number;
  display_order: number;
}

export interface Person {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  area: string | null;
  auth_user_id: string | null;
  is_active: boolean;
}

export interface EvaluationCycle {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "open" | "closed";
}

export interface Evaluatee {
  id: string;
  cycle_id: string;
  person_id: string;
  job_title: string | null;
  area: string | null;
}

export interface EvaluationAssignment {
  id: string;
  evaluatee_id: string;
  evaluator_person_id: string;
  evaluator_type_id: string;
  status: "pending" | "in_progress" | "completed";
  submitted_at: string | null;
}

export interface EvaluationScore {
  id: string;
  assignment_id: string;
  competency_id: string;
  score: number;
  evidence: string | null;
  updated_at: string;
}

export interface VCompetencyResult {
  evaluatee_id: string;
  cycle_id: string;
  evaluatee_person_id: string;
  evaluatee_name: string;
  competency_id: string;
  dimension: string;
  category: string;
  competency_name: string;
  display_order: number;
  gestor_score: number | null;
  pares_score: number | null;
  subordinados_score: number | null;
  autoavaliacao_score: number | null;
  weighted_result: number | null;
}

export interface VEvaluateeFinalResult {
  evaluatee_id: string;
  cycle_id: string;
  evaluatee_person_id: string;
  evaluatee_name: string;
  gestor_avg: number | null;
  pares_avg: number | null;
  subordinados_avg: number | null;
  autoavaliacao_avg: number | null;
  final_result: number | null;
  total_competencies: number;
  competencies_scored: number;
}

export interface VAssignmentProgress {
  assignment_id: string;
  evaluatee_id: string;
  cycle_id: string;
  evaluatee_name: string;
  evaluator_person_id: string;
  evaluator_name: string;
  evaluator_type_code: string;
  evaluator_type_label: string;
  status: string;
  submitted_at: string | null;
  total_competencies: number;
  scores_filled: number;
  pct_complete: number;
}
