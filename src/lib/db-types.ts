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
 
export type Diretoria =
  | "Diretoria de Benefícios"
  | "Diretoria de Finanças"
  | "Superintendência";

export const DIRETORIAS: Diretoria[] = [
  "Diretoria de Benefícios",
  "Diretoria de Finanças",
  "Superintendência",
];

export interface Person {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  area: string | null;
  diretoria: Diretoria | null;
  avatar_url: string | null;
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
 
export interface GoalCategory {
  id: string;
  cycle_id: string;
  name: string;
  weight: number;
}
 
export interface Goal {
  id: string;
  evaluatee_id: string;
  cycle_id: string;
  category_id: string;
  template_id: string | null;
  description: string;
  expected_score: number;
  obtained_score: number | null;
  evidence: string | null;
}
 
export interface GoalTemplate {
  id: string;
  cycle_id: string;
  category_id: string;
  description: string;
  expected_score: number;
}
 
export interface CompetencyAssignment {
  id: string;
  evaluatee_id: string;
  competency_id: string;
}
 
export interface AcademicLevel {
  id: string;
  order_index: number;
  name: string;
  description: string | null;
  evidence_required: string | null;
  score: number;
}
 
export interface PersonAcademicQualification {
  id: string;
  person_id: string;
  academic_level_id: string;
  evidence_url: string | null;
  achieved_date: string | null;
  is_current: boolean;
}
 
export interface CertificationCatalog {
  id: string;
  name: string;
  issuing_entity: string | null;
  bonus: number;
}
 
export interface PersonCertification {
  id: string;
  person_id: string;
  certification_id: string;
  obtained: boolean;
  obtained_date: string | null;
  evidence_url: string | null;
}
 
export interface EvaluationWeightConfig {
  id: string;
  cycle_id: string;
  competencies_weight: number;
  goals_weight: number;
  academic_weight: number;
  certification_weight: number;
}
 
export interface VGoalCategoryResult {
  evaluatee_id: string;
  cycle_id: string;
  category_id: string;
  category_name: string;
  weight: number;
  avg_obtained: number | null;
  pct_alcance: number | null;
  weighted_result: number | null;
}
 
export interface VGoalFinalResult {
  evaluatee_id: string;
  cycle_id: string;
  goals_final_score: number | null;
}
 
export interface VPersonFinalScore {
  evaluatee_id: string;
  cycle_id: string;
  evaluatee_name: string;
  competencies_score: number | null;
  goals_final_score: number | null;
  academic_final_score: number | null;
  certification_final_score: number | null;
  competencies_weight: number;
  goals_weight: number;
  academic_weight: number;
  certification_weight: number;
  overall_final_score: number | null;
}
