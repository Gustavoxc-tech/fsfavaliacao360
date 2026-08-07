-- =========================================================
-- PDI — Plano de Desenvolvimento Individual
-- Rode este bloco inteiro no SQL Editor do Supabase.
-- =========================================================

-- ============ 1. Cabeçalho ============
create table if not exists public.development_plans (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  period text,
  status text not null default 'pendente_cadastro'
    check (status in ('pendente_cadastro','em_andamento','concluido')),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, cycle_id)
);

-- ============ 2. Itens ============
create table if not exists public.development_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.development_plans(id) on delete cascade,
  competency_id uuid references public.competencies(id) on delete set null,
  category text,
  current_score numeric(4,2) check (current_score is null or (current_score >= 0 and current_score <= 5)),
  target_score numeric(4,2) check (target_score is null or (target_score >= 0 and target_score <= 5)),
  action text,
  responsible text,
  due_date date,
  source text not null default 'auto' check (source in ('auto','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, competency_id)
);

create index if not exists idx_dpi_plan on public.development_plan_items(plan_id);

-- ============ GRANTS ============
grant select, insert, update, delete on
  public.development_plans, public.development_plan_items
to authenticated;

grant all on
  public.development_plans, public.development_plan_items
to service_role;

-- ============ RLS ============
alter table public.development_plans enable row level security;
alter table public.development_plan_items enable row level security;

drop policy if exists "pdi admin all" on public.development_plans;
create policy "pdi admin all" on public.development_plans for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

drop policy if exists "pdi owner read" on public.development_plans;
create policy "pdi owner read" on public.development_plans for select to authenticated
  using (exists (
    select 1 from public.people p
    where p.id = development_plans.person_id and p.auth_user_id = auth.uid()
  ));

drop policy if exists "pdi item admin all" on public.development_plan_items;
create policy "pdi item admin all" on public.development_plan_items for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

drop policy if exists "pdi item owner read" on public.development_plan_items;
create policy "pdi item owner read" on public.development_plan_items for select to authenticated
  using (exists (
    select 1
    from public.development_plans dp
    join public.people p on p.id = dp.person_id
    where dp.id = development_plan_items.plan_id and p.auth_user_id = auth.uid()
  ));

-- ============ 3. Detecção automática (idempotente) ============
-- Cria cabeçalho + itens para quem tem nota final < 3 OU competência com nota <= 3.
create or replace function public.generate_pdi_for_cycle(_cycle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- cabeçalhos
  insert into public.development_plans (person_id, cycle_id, status)
  select distinct t.person_id, _cycle_id, 'pendente_cadastro'
  from (
    select f.evaluatee_person_id as person_id
    from public.v_person_final_score f
    where f.cycle_id = _cycle_id and f.overall_final_score is not null and f.overall_final_score < 3
    union
    select c.evaluatee_person_id
    from public.v_competency_results c
    where c.cycle_id = _cycle_id and c.weighted_result is not null and c.weighted_result <= 3
  ) t
  on conflict (person_id, cycle_id) do nothing;

  -- itens automáticos (competências com nota <= 3)
  insert into public.development_plan_items (plan_id, competency_id, category, current_score, source)
  select dp.id,
         c.competency_id,
         case when c.weighted_result <= 2 then 'Prioridade de Desenvolvimento'
              else 'Oportunidade de Melhoria' end,
         round(c.weighted_result::numeric, 2),
         'auto'
  from public.v_competency_results c
  join public.development_plans dp
    on dp.person_id = c.evaluatee_person_id and dp.cycle_id = c.cycle_id
  where c.cycle_id = _cycle_id
    and c.weighted_result is not null
    and c.weighted_result <= 3
  on conflict (plan_id, competency_id) do nothing;
end;
$$;

grant execute on function public.generate_pdi_for_cycle(uuid) to authenticated;
