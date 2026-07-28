## PeopleZenith — Reformulação completa

Vou entregar em 5 blocos. Nenhuma query, RLS ou cálculo de score muda.

### 1. Marca e paleta
- Renomear "Avaliação 360°" → **PeopleZenith** em `AppShell.tsx`, `__root.tsx` (title/meta), `auth.tsx` e `_app.index.tsx`.
- Nova paleta em `src/styles.css` (light + dark, mesmos nomes de variável):
  - `--primary` #004080 (Azul Safira)
  - `--success` / accent de ação #00CC99 (Verde Menta)
  - `--background` #F5F7FA / `--card` #FFFFFF
  - `--destructive` trocado por laranja/âmbar (#F59E0B / #F97316) para faixas "atenção"
  - `--chart-1..5` variações safira→menta
  - Sidebar em safira escuro
- Gradiente de progresso safira→menta como utility CSS.

### 2. Fluxo de avaliação em abas sequenciais
Reestruturar `_app.evaluator.$assignmentId.tsx`:
- Componente `Tabs` (shadcn) com 4 passos, abre em "Avaliação 360°".
- **Aba 1 — Avaliação 360°**: só competências (Atitudes+Habilidades). Botão "Salvar e ir para Metas".
- **Aba 2 — Metas**: seção atual de metas (só gestor edita; para outros tipos, exibir aviso "Somente gestor avalia metas" e liberar avançar). Botão "Salvar e ir para Qualificações".
- **Aba 3 — Qualificações** (read-only): lista `person_academic_qualifications` do avaliado com nível/evidências. Botão "Ir para Certificações".
- **Aba 4 — Certificações** (read-only): lista `person_certifications` obtidas. Botão "Concluir Avaliação" → marca `evaluation_assignments.status = 'completed'` e `submitted_at = now()`.

### 3. Diretoria + hierarquia em Admin > Pessoas
- Migration: adicionar `people.diretoria` (enum) com valores fixos: `Diretoria de Benefícios`, `Diretoria de Finanças`, `Superintendência`. Backfill automático baseado em `area`:
  - `Gerência de Benefícios` → Diretoria de Benefícios
  - `Gerência de Finanças` → Diretoria de Finanças
  - `Administração e Tecnologia`, `Contabilidade e Orçamento`, `Secretaria` → Superintendência
- UI: agrupar em cards colapsáveis por Diretoria → subgrupos por Gerência (`area`). Filtro no topo por Diretoria.
- Form de criação/edição de pessoa inclui select de Diretoria.

### 4. Avatares
- Migration: coluna `people.avatar_url text`.
- Criar bucket público `avatars` via `supabase--storage_create_bucket` + policies.
- Botão de upload na linha de pessoa (Admin > Pessoas) e no drawer. Usa Supabase Storage; grava URL pública.
- Componente `PersonAvatar` reutilizável: mostra foto se existir, senão iniciais (padrão atual).
- Aplicar em: drawer, cards de "Avaliações Pendentes", tabela de pessoas.

### 5. Avaliações Pendentes (Admin) + refresh do drawer
- Nova rota `_app.admin.pending.tsx` (nova aba em Admin): grid de cards arredondados, um por assignment não-completo do ciclo aberto. Cada card: avatar do avaliado, nome, cargo/gerência, avaliador, tipo, barra de progresso com gradiente safira→menta (`pct_complete` da view `v_assignment_progress`).
- `PersonProfileDrawer`: atualizar cores para nova paleta, usar `PersonAvatar` (foto → iniciais fallback). Mantém dados, badges, donuts de metas e radar Atitudes×Habilidades.

### Detalhes técnicos
- Migrations SQL: `ALTER TABLE people ADD COLUMN diretoria text` + CHECK; `ADD COLUMN avatar_url text`; UPDATE de backfill.
- Storage: bucket `avatars` público, policy insert/update por owner autenticado; read público.
- Sem alterar views, tipos de avaliador, cálculos de score ou RLS existentes.
- Todos os componentes usam tokens semânticos (nada de hex hardcoded em JSX).

### Fora de escopo
- Nenhuma mudança em cálculo de pesos, views ou lógica de RLS.
- Nada muda em Colaborador > "Meus Resultados" além da nova paleta herdada.
