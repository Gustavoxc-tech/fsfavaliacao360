# Expansão Evoluir 360 — Metas, Acadêmico e Certificações

## 1. SQL a rodar no Supabase (entrego em bloco único)

Como o Supabase é seu (externo), vou gerar um `.sql` para você colar no SQL Editor. Não posso rodar daqui.

### Novas tabelas (RLS habilitada, GRANTs para authenticated; padrão de policies igual ao existente)
- `goal_categories(id, cycle_id fk evaluation_cycles, name, weight numeric)` — soma por ciclo validada na UI + CHECK opcional.
- `goals(id, evaluatee_id, cycle_id, category_id, description, expected_score default 5, obtained_score, evidence)`
- `academic_levels(id, order_index, name, description, evidence_required text, score numeric)`
- `person_academic_qualifications(id, person_id, academic_level_id, evidence_url, achieved_date, is_current bool)`
- `certifications_catalog(id, name, issuing_entity, bonus numeric)`
- `person_certifications(id, person_id, certification_id, obtained bool, obtained_date, evidence_url)`
- `evaluation_weight_config(id, cycle_id unique, competencies_weight 0.60, goals_weight 0.30, academic_weight 0.05, certification_weight 0.05)`

### Views
- `v_goal_category_results` — por avaliado/ciclo/categoria: avg(obtained), % alcance vs expected, resultado ponderado = avg_pct × category.weight.
- `v_goal_final_results` — soma dos ponderados por avaliado/ciclo (0–5 renormalizado).
- `v_academic_results` — max(score) do nível atual por pessoa.
- `v_certification_results` — sum(bonus) das obtidas por pessoa.
- `v_person_final_score` — junta `v_evaluatee_final_results` + metas + acadêmico + certificação × pesos de `evaluation_weight_config` (renormaliza se algum bloco não existir), retorna `overall_final_score`.

### RLS (mesmo padrão)
- Admin: full via `has_role(auth.uid(),'admin')`.
- Colaborador: SELECT em suas próprias linhas (`person_id = auth.uid via people`).
- Escrita: admin. Exceção: `goals.obtained_score` — gestor da atribuição pode UPDATE (via policy checando existência de `evaluation_assignments` do tipo gestor para aquele avaliado no ciclo).

## 2. Frontend

### Novas rotas admin
- `src/routes/_app.admin.goals.tsx` — categorias por ciclo (peso, validação soma=100%) + metas por avaliado.
- `src/routes/_app.admin.academic.tsx` — CRUD `academic_levels` + atribuição de nível atual por pessoa.
- `src/routes/_app.admin.certifications.tsx` — CRUD `certifications_catalog` + marcação por pessoa.
- Atualizar tabs em `_app.admin.tsx` com Metas / Qualificação / Certificações.

### Tela de avaliação (`_app.evaluator.$assignmentId.tsx`)
- Nova seção "Metas" (só visível para avaliadores do tipo gestor) listando metas do avaliado por categoria, input de `obtained_score`, mostrando % alcance e ponderado da categoria. Auto-save (upsert) igual ao padrão de scores.

### "Meus Resultados" (`_app.collaborator.tsx`)
- Card resumo 4 blocos (Competências / Metas / Acadêmico / Certificação) com nota, peso, resultado; linha final "Nota Final Geral" da `v_person_final_score`. Mantém gráficos existentes.

### "Relatórios" (`_app.reports.tsx`)
- Adiciona colunas: Metas | Qualificação | Certificação | Nota Final Geral, lidas de `v_person_final_score`.
- CSV/PDF exports incluem novas colunas.

### Types
- Estender `src/lib/db-types.ts` com novas interfaces + views.

## 3. Ordem de entrega
1. Gerar `.sql` completo (tabelas + views + RLS + grants).
2. Enquanto você aplica, eu implemento todos os arquivos frontend.
3. Ao confirmar aplicação, valido build.

## Detalhes técnicos
- Todos os cálculos (ponderações, % alcance, renormalização) vivem em SQL/views — frontend só consome.
- Estilo visual mantido (sidebar escura, cards, badges, Tailwind tokens atuais).
- Nenhuma alteração destrutiva nas telas atuais.

Confirma para eu gerar o `.sql` e começar a implementação em paralelo?