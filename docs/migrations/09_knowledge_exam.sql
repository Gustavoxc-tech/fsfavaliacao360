-- =========================================================
-- Prova de Conhecimentos (10%) + pesos configuráveis
-- Rode este bloco inteiro no SQL Editor do Supabase.
-- =========================================================

-- ============ 1. Notas da prova por pessoa/ciclo ============
create table if not exists public.knowledge_exams (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  sector_legislation_score numeric(4,2) check (sector_legislation_score is null or (sector_legislation_score >= 0 and sector_legislation_score <= 10)),
  specific_legislation_score numeric(4,2) check (specific_legislation_score is null or (specific_legislation_score >= 0 and specific_legislation_score <= 10)),
  internal_norms_score numeric(4,2) check (internal_norms_score is null or (internal_norms_score >= 0 and internal_norms_score <= 10)),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, cycle_id)
);

-- ============ 2. Pesos dos 3 subcritérios da prova (por ciclo) ============
create table if not exists public.knowledge_exam_weight_config (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null unique references public.evaluation_cycles(id) on delete cascade,
  sector_legislation_weight numeric not null default 0.3334,
  specific_legislation_weight numeric not null default 0.3333,
  internal_norms_weight numeric not null default 0.3333
);

-- ============ 3. Peso geral do novo bloco + ajuste de Metas ============
alter table public.evaluation_weight_config
  add column if not exists knowledge_exam_weight numeric not null default 0.10;

alter table public.evaluation_weight_config
  alter column goals_weight set default 0.20;

-- ciclos já configurados com o padrão antigo (30% metas) passam para 20%
update public.evaluation_weight_config
set goals_weight = 0.20
where goals_weight = 0.30;

-- ============ GRANTS ============
grant select, insert, update, delete on
  public.knowledge_exams, public.knowledge_exam_weight_config
to authenticated;

grant all on
  public.knowledge_exams, public.knowledge_exam_weight_config
to service_role;

-- ============ RLS ============
alter table public.knowledge_exams enable row level security;
alter table public.knowledge_exam_weight_config enable row level security;

-- Somente admin escreve
drop policy if exists "ke admin all" on public.knowledge_exams;
create policy "ke admin all" on public.knowledge_exams for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- Avaliado lê a própria nota
drop policy if exists "ke read own" on public.knowledge_exams;
create policy "ke read own" on public.knowledge_exams for select to authenticated using (
  exists (select 1 from public.people p where p.id = knowledge_exams.person_id and p.auth_user_id = auth.uid())
);

drop policy if exists "kewc admin all" on public.knowledge_exam_weight_config;
create policy "kewc admin all" on public.knowledge_exam_weight_config for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "kewc read" on public.knowledge_exam_weight_config;
create policy "kewc read" on public.knowledge_exam_weight_config for select to authenticated using (true);

-- ============ VIEW: nota da prova (0 a 5) ============
create or replace view public.v_knowledge_exam_results as
select
  ke.person_id,
  ke.cycle_id,
  ke.sector_legislation_score,
  ke.specific_legislation_score,
  ke.internal_norms_score,
  coalesce(kw.sector_legislation_weight, 0.3334)   as sector_legislation_weight,
  coalesce(kw.specific_legislation_weight, 0.3333) as specific_legislation_weight,
  coalesce(kw.internal_norms_weight, 0.3333)       as internal_norms_weight,
  case when (
      (case when ke.sector_legislation_score   is not null then coalesce(kw.sector_legislation_weight, 0.3334) else 0 end)
    + (case when ke.specific_legislation_score is not null then coalesce(kw.specific_legislation_weight, 0.3333) else 0 end)
    + (case when ke.internal_norms_score       is not null then coalesce(kw.internal_norms_weight, 0.3333) else 0 end)
  ) > 0 then (
      (
        coalesce(ke.sector_legislation_score   * coalesce(kw.sector_legislation_weight, 0.3334), 0)
      + coalesce(ke.specific_legislation_score * coalesce(kw.specific_legislation_weight, 0.3333), 0)
      + coalesce(ke.internal_norms_score       * coalesce(kw.internal_norms_weight, 0.3333), 0)
      ) / (
        (case when ke.sector_legislation_score   is not null then coalesce(kw.sector_legislation_weight, 0.3334) else 0 end)
      + (case when ke.specific_legislation_score is not null then coalesce(kw.specific_legislation_weight, 0.3333) else 0 end)
      + (case when ke.internal_norms_score       is not null then coalesce(kw.internal_norms_weight, 0.3333) else 0 end)
      )
    ) / 2
  else null end as knowledge_exam_score
from public.knowledge_exams ke
left join public.knowledge_exam_weight_config kw on kw.cycle_id = ke.cycle_id;

-- ============ VIEW FINAL (recriada incluindo a prova) ============
drop view if exists public.v_person_final_score;

create view public.v_person_final_score as
with base as (
  select
    ef.evaluatee_id,
    ef.cycle_id,
    ef.evaluatee_person_id,
    ef.evaluatee_name,
    ef.final_result                        as competencies_score,
    gf.goals_score_0_5                     as goals_score,
    ar.academic_score                      as academic_score,
    cr.certification_score                 as certification_score,
    kr.knowledge_exam_score                as knowledge_exam_score,
    kr.sector_legislation_score,
    kr.specific_legislation_score,
    kr.internal_norms_score,
    coalesce(wc.competencies_weight, 0.60)   as competencies_weight,
    coalesce(wc.goals_weight, 0.20)          as goals_weight,
    coalesce(wc.academic_weight, 0.05)       as academic_weight,
    coalesce(wc.certification_weight, 0.05)  as certification_weight,
    coalesce(wc.knowledge_exam_weight, 0.10) as knowledge_exam_weight
  from public.v_evaluatee_final_results ef
  left join public.v_goal_final_results gf on gf.evaluatee_id = ef.evaluatee_id and gf.cycle_id = ef.cycle_id
  left join public.v_academic_results ar on ar.person_id = ef.evaluatee_person_id
  left join public.v_certification_results cr on cr.person_id = ef.evaluatee_person_id
  left join public.v_knowledge_exam_results kr on kr.person_id = ef.evaluatee_person_id and kr.cycle_id = ef.cycle_id
  left join public.evaluation_weight_config wc on wc.cycle_id = ef.cycle_id
),
calc as (
  select b.*,
    (case when b.competencies_score  is not null then b.competencies_weight  else 0 end)
  + (case when b.goals_score         is not null then b.goals_weight         else 0 end)
  + (case when b.academic_score      is not null then b.academic_weight      else 0 end)
  + (case when b.certification_score is not null then b.certification_weight else 0 end)
  + (case when b.knowledge_exam_score is not null then b.knowledge_exam_weight else 0 end) as total_weight,
    coalesce(b.competencies_score   * b.competencies_weight, 0)
  + coalesce(b.goals_score          * b.goals_weight, 0)
  + coalesce(b.academic_score       * b.academic_weight, 0)
  + coalesce(b.certification_score  * b.certification_weight, 0)
  + coalesce(b.knowledge_exam_score * b.knowledge_exam_weight, 0) as total_weighted
  from base b
)
select
  c.evaluatee_id,
  c.cycle_id,
  c.evaluatee_person_id,
  c.evaluatee_name,
  c.competencies_score,
  c.goals_score,
  c.goals_score          as goals_final_score,
  c.academic_score,
  c.academic_score       as academic_final_score,
  c.certification_score,
  c.certification_score  as certification_final_score,
  c.knowledge_exam_score,
  c.knowledge_exam_score as knowledge_exam_final_score,
  c.sector_legislation_score,
  c.specific_legislation_score,
  c.internal_norms_score,
  c.competencies_weight,
  c.goals_weight,
  c.academic_weight,
  c.certification_weight,
  c.knowledge_exam_weight,
  case when c.total_weight > 0 then c.total_weighted / c.total_weight else null end as overall_final_score
from calc c;

grant select on public.v_knowledge_exam_results, public.v_person_final_score to authenticated, anon;
