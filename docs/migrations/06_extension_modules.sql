-- ============================================================
-- Evoluir 360 — Módulos adicionais: Metas, Acadêmico, Certificações
-- Rode este bloco inteiro no SQL Editor do Supabase.
-- ============================================================

-- ============ TABLES ============
create table if not exists public.goal_categories (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  name text not null,
  weight numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  evaluatee_id uuid not null references public.evaluatees(id) on delete cascade,
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  category_id uuid not null references public.goal_categories(id) on delete cascade,
  description text not null,
  expected_score numeric not null default 5,
  obtained_score numeric,
  evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academic_levels (
  id uuid primary key default gen_random_uuid(),
  order_index int not null default 0,
  name text not null,
  description text,
  evidence_required text,
  score numeric not null default 0
);

create table if not exists public.person_academic_qualifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  academic_level_id uuid not null references public.academic_levels(id) on delete cascade,
  evidence_url text,
  achieved_date date,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.certifications_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  issuing_entity text,
  bonus numeric not null default 0
);

create table if not exists public.person_certifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  certification_id uuid not null references public.certifications_catalog(id) on delete cascade,
  obtained boolean not null default false,
  obtained_date date,
  evidence_url text,
  unique (person_id, certification_id)
);

create table if not exists public.evaluation_weight_config (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null unique references public.evaluation_cycles(id) on delete cascade,
  competencies_weight numeric not null default 0.60,
  goals_weight numeric not null default 0.30,
  academic_weight numeric not null default 0.05,
  certification_weight numeric not null default 0.05
);

-- ============ GRANTS ============
grant select, insert, update, delete on
  public.goal_categories, public.goals, public.academic_levels,
  public.person_academic_qualifications, public.certifications_catalog,
  public.person_certifications, public.evaluation_weight_config
to authenticated;

grant all on
  public.goal_categories, public.goals, public.academic_levels,
  public.person_academic_qualifications, public.certifications_catalog,
  public.person_certifications, public.evaluation_weight_config
to service_role;

-- ============ RLS ============
alter table public.goal_categories enable row level security;
alter table public.goals enable row level security;
alter table public.academic_levels enable row level security;
alter table public.person_academic_qualifications enable row level security;
alter table public.certifications_catalog enable row level security;
alter table public.person_certifications enable row level security;
alter table public.evaluation_weight_config enable row level security;

-- goal_categories: admin escreve, todos autenticados leem
drop policy if exists "gc admin all" on public.goal_categories;
create policy "gc admin all" on public.goal_categories for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "gc read all" on public.goal_categories;
create policy "gc read all" on public.goal_categories for select to authenticated using (true);

-- goals: admin all; próprio avaliado leitura; gestor da atribuição pode ler/atualizar
drop policy if exists "goals admin all" on public.goals;
create policy "goals admin all" on public.goals for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

drop policy if exists "goals read own" on public.goals;
create policy "goals read own" on public.goals for select to authenticated using (
  exists (
    select 1 from public.evaluatees ev
    join public.people p on p.id = ev.person_id
    where ev.id = goals.evaluatee_id and p.auth_user_id = auth.uid()
  )
);

drop policy if exists "goals gestor read" on public.goals;
create policy "goals gestor read" on public.goals for select to authenticated using (
  exists (
    select 1 from public.evaluation_assignments a
    join public.evaluator_types et on et.id = a.evaluator_type_id
    join public.people p on p.id = a.evaluator_person_id
    where a.evaluatee_id = goals.evaluatee_id
      and et.code = 'gestor'
      and p.auth_user_id = auth.uid()
  )
);

drop policy if exists "goals gestor update" on public.goals;
create policy "goals gestor update" on public.goals for update to authenticated using (
  exists (
    select 1 from public.evaluation_assignments a
    join public.evaluator_types et on et.id = a.evaluator_type_id
    join public.people p on p.id = a.evaluator_person_id
    where a.evaluatee_id = goals.evaluatee_id
      and et.code = 'gestor'
      and p.auth_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.evaluation_assignments a
    join public.evaluator_types et on et.id = a.evaluator_type_id
    join public.people p on p.id = a.evaluator_person_id
    where a.evaluatee_id = goals.evaluatee_id
      and et.code = 'gestor'
      and p.auth_user_id = auth.uid()
  )
);

-- academic_levels: admin escreve, todos leem
drop policy if exists "al admin all" on public.academic_levels;
create policy "al admin all" on public.academic_levels for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "al read" on public.academic_levels;
create policy "al read" on public.academic_levels for select to authenticated using (true);

-- person_academic_qualifications: admin all, próprio leitura
drop policy if exists "paq admin all" on public.person_academic_qualifications;
create policy "paq admin all" on public.person_academic_qualifications for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "paq read own" on public.person_academic_qualifications;
create policy "paq read own" on public.person_academic_qualifications for select to authenticated using (
  exists (select 1 from public.people p where p.id = person_academic_qualifications.person_id and p.auth_user_id = auth.uid())
);

-- certifications_catalog: admin escreve, todos leem
drop policy if exists "cc admin all" on public.certifications_catalog;
create policy "cc admin all" on public.certifications_catalog for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "cc read" on public.certifications_catalog;
create policy "cc read" on public.certifications_catalog for select to authenticated using (true);

-- person_certifications: admin all, próprio leitura
drop policy if exists "pc admin all" on public.person_certifications;
create policy "pc admin all" on public.person_certifications for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "pc read own" on public.person_certifications;
create policy "pc read own" on public.person_certifications for select to authenticated using (
  exists (select 1 from public.people p where p.id = person_certifications.person_id and p.auth_user_id = auth.uid())
);

-- evaluation_weight_config: admin escreve, todos leem
drop policy if exists "wc admin all" on public.evaluation_weight_config;
create policy "wc admin all" on public.evaluation_weight_config for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "wc read" on public.evaluation_weight_config;
create policy "wc read" on public.evaluation_weight_config for select to authenticated using (true);

-- ============ VIEWS ============

create or replace view public.v_goal_category_results as
select
  g.evaluatee_id,
  g.cycle_id,
  g.category_id,
  gc.name as category_name,
  gc.weight as category_weight,
  count(*)::int as goals_count,
  count(g.obtained_score)::int as goals_scored,
  avg(g.obtained_score) as avg_obtained,
  case when sum(g.expected_score) > 0
       then sum(coalesce(g.obtained_score,0)) / sum(g.expected_score)
       else null end as pct_achievement,
  case when sum(g.expected_score) > 0
       then (sum(coalesce(g.obtained_score,0)) / sum(g.expected_score)) * gc.weight
       else null end as weighted_result
from public.goals g
join public.goal_categories gc on gc.id = g.category_id
group by g.evaluatee_id, g.cycle_id, g.category_id, gc.name, gc.weight;

create or replace view public.v_goal_final_results as
select
  gcr.evaluatee_id,
  gcr.cycle_id,
  sum(coalesce(gcr.weighted_result, 0)) as total_weighted_pct,
  case when sum(gcr.category_weight) > 0
       then (sum(coalesce(gcr.weighted_result, 0)) / sum(gcr.category_weight)) * 5
       else null end as goals_score_0_5
from public.v_goal_category_results gcr
group by gcr.evaluatee_id, gcr.cycle_id;

create or replace view public.v_academic_results as
select
  paq.person_id,
  max(al.score) as academic_score
from public.person_academic_qualifications paq
join public.academic_levels al on al.id = paq.academic_level_id
where paq.is_current = true
group by paq.person_id;

create or replace view public.v_certification_results as
select
  pc.person_id,
  sum(cc.bonus) as certification_score
from public.person_certifications pc
join public.certifications_catalog cc on cc.id = pc.certification_id
where pc.obtained = true
group by pc.person_id;

create or replace view public.v_person_final_score as
select
  ef.evaluatee_id,
  ef.cycle_id,
  ef.evaluatee_person_id,
  ef.evaluatee_name,
  ef.final_result as competencies_score,
  gf.goals_score_0_5 as goals_score,
  ar.academic_score,
  cr.certification_score,
  coalesce(wc.competencies_weight, 0.60) as competencies_weight,
  coalesce(wc.goals_weight, 0.30) as goals_weight,
  coalesce(wc.academic_weight, 0.05) as academic_weight,
  coalesce(wc.certification_weight, 0.05) as certification_weight,
  case
    when nullif(
      (case when ef.final_result is not null then coalesce(wc.competencies_weight, 0.60) else 0 end)
    + (case when gf.goals_score_0_5 is not null then coalesce(wc.goals_weight, 0.30) else 0 end)
    + (case when ar.academic_score is not null then coalesce(wc.academic_weight, 0.05) else 0 end)
    + (case when cr.certification_score is not null then coalesce(wc.certification_weight, 0.05) else 0 end)
    , 0) is null then null
    else (
      coalesce(ef.final_result * coalesce(wc.competencies_weight, 0.60), 0)
    + coalesce(gf.goals_score_0_5 * coalesce(wc.goals_weight, 0.30), 0)
    + coalesce(ar.academic_score * coalesce(wc.academic_weight, 0.05), 0)
    + coalesce(cr.certification_score * coalesce(wc.certification_weight, 0.05), 0)
    ) /
    (
      (case when ef.final_result is not null then coalesce(wc.competencies_weight, 0.60) else 0 end)
    + (case when gf.goals_score_0_5 is not null then coalesce(wc.goals_weight, 0.30) else 0 end)
    + (case when ar.academic_score is not null then coalesce(wc.academic_weight, 0.05) else 0 end)
    + (case when cr.certification_score is not null then coalesce(wc.certification_weight, 0.05) else 0 end)
    )
  end as overall_final_score
from public.v_evaluatee_final_results ef
left join public.v_goal_final_results gf on gf.evaluatee_id = ef.evaluatee_id and gf.cycle_id = ef.cycle_id
left join public.v_academic_results ar on ar.person_id = ef.evaluatee_person_id
left join public.v_certification_results cr on cr.person_id = ef.evaluatee_person_id
left join public.evaluation_weight_config wc on wc.cycle_id = ef.cycle_id;

grant select on
  public.v_goal_category_results, public.v_goal_final_results,
  public.v_academic_results, public.v_certification_results,
  public.v_person_final_score
to authenticated, anon;
