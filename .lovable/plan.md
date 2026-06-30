## Conexão com o Supabase existente

Já validei a conexão com o projeto `tqtdehcwkzicxjynqtje` usando a anon key (HTTP 200 em `/rest/v1/competencies`). Não vou rodar migrations — todas as tabelas, views, RLS, triggers e funções já existem no seu banco.

**Passo 1 — Cliente Supabase**
- Instalar `@supabase/supabase-js`.
- Criar `src/integrations/supabase/client.ts` (browser) com URL + anon key.
- Criar `src/integrations/supabase/types.ts` com tipos para as tabelas/views que o front consome (gerados manualmente a partir do schema descrito; depois você pode rodar `supabase gen types typescript` localmente e me enviar o output para substituir).
- `.env` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.

**Passo 2 — Auth**
- Login por **e-mail + senha** (Supabase Auth) — sem cadastro público; admin cria usuários (ou via SQL/painel).
- `src/routes/auth.tsx` (login + esqueci minha senha + `/reset-password`).
- `_authenticated/route.tsx` (gate `ssr:false` → redireciona para `/auth`).
- Hook `useCurrentUser` lendo `auth.users` + `profiles` + `user_roles` (papel: `admin`, `collaborator`).

## Estrutura de rotas

```
/auth                              login + reset
/reset-password                    nova senha
/_authenticated/
  /                                redireciona conforme papel
  /evaluator                       minhas avaliações pendentes
  /evaluator/$assignmentId         formulário de avaliação 360°
  /collaborator                    meus resultados (ciclos)
  /collaborator/$cycleId           detalhe do meu resultado
  /admin                           dashboard admin
  /admin/cycles                    CRUD ciclos + abertura/fechamento
  /admin/competencies              catálogo (47 competências) read/edit
  /admin/role-profiles             perfis de cargo + competências
  /admin/users                     usuários, papéis, cargos
  /admin/assignments               matriz avaliador↔avaliado por ciclo
  /admin/reports                   resultados consolidados + export
  /admin/reports/$cycleId/$userId  relatório individual + CSV/PDF
```

## Telas e funcionalidades

### Avaliador (`/evaluator`)
- Lista de avaliações pendentes do ciclo aberto (por `assignments` onde `evaluator_id = me`).
- Formulário por avaliado: competências do perfil do avaliado, agrupadas por dimensão (Atitudes/Habilidades), com descritores expansíveis, nota 1–5 e comentário opcional por competência + comentário geral.
- **Save parcial** (rascunho) e **enviar** (lock). Estado lido/escrito em `evaluations` + `evaluation_scores`.
- Indicador de progresso (X de Y competências preenchidas).

### Colaborador (`/collaborator`)
- Lista de ciclos onde tenho resultado disponível (somente fechados/publicados).
- Detalhe: ler diretamente da view consolidada do banco (não recalcular pesos no front). Mostrar:
  - Nota final por competência (renormalização já vem da view).
  - Quebra por tipo de avaliador (auto, gestor, pares, subordinados).
  - Gráfico radar por dimensão + barras por competência.
  - Comentários agregados/anonimizados conforme a view permitir.

### Admin
- **Ciclos**: criar, abrir, fechar, publicar. Datas, descrição.
- **Competências**: ler e editar descritores (catálogo único de 47).
- **Perfis de cargo**: vincular competências por cargo.
- **Usuários**: listar, atribuir papel (`admin`/`collaborator`) via tabela `user_roles`, vincular cargo.
- **Matriz de assignments**: por ciclo, montar quem avalia quem e em qual papel (auto / gestor / par / subordinado). UI tabular com bulk-add.
- **Relatórios**:
  - Lista de avaliados do ciclo + status (% concluído por tipo de avaliador).
  - Relatório individual consumindo a view consolidada.
  - **Export CSV** (client-side, blob download).
  - **Export PDF** (client-side com `jspdf` + `jspdf-autotable`, incluindo cabeçalho, tabela de competências, gráfico renderizado como imagem via `html2canvas`).

## Dados, segurança e regras

- **Todo acesso passa pelo Supabase com a anon key + RLS** — nenhuma chave de service role no front.
- **Pesos e nota final**: sempre lidos das views (`v_results_by_competency`, `v_results_by_dimension`, ou equivalentes do seu schema). Front não recalcula.
- **Competências sem nota de um tipo de avaliador**: a view já renormaliza; front só exibe.
- **Papéis**: checados via `has_role(auth.uid(), 'admin')` (RPC) para liberar rotas admin. O gate de UI é só conveniência — RLS é a defesa real.
- **Rascunho vs envio**: campo `status` (`draft` / `submitted`) em `evaluations`; após `submitted`, scores são imutáveis (regra de RLS do banco).

## Stack técnico

- TanStack Start + TanStack Query (já no template) para data fetching com cache.
- `react-hook-form` + `zod` para formulários de avaliação.
- `recharts` para radar/barras.
- `jspdf` + `jspdf-autotable` + `html2canvas` para PDF.
- Tudo em português.

## Premissas que assumo (me avise se alguma estiver errada)

1. Os nomes exatos das views consolidadas seguem o padrão `v_*` do schema que você descreveu — vou ler o que existir e ajustar.
2. Existe uma tabela `profiles` espelhando `auth.users` (com `full_name`, `role_profile_id`). Se não, eu crio um arquivo de migration `.sql` para **você rodar manualmente** (não vou aplicar nada no seu banco).
3. Existe `user_roles` + função `has_role` (padrão Lovable). Mesma regra acima se faltar.
4. Sem cadastro público — admin cria usuários direto no painel do Supabase ou via tela admin (usando `supabase.auth.admin` exigiria service role; então tela admin **convida** por email com magic link via fluxo padrão do Supabase ou só lista quem já existe).

## Entrega

Vou implementar tudo de uma vez. Se algo precisar de um SQL adicional no seu banco (ex.: trigger faltando, view com nome diferente), eu te entrego o `.sql` para você rodar — não toco no banco automaticamente.

Confirma para eu começar?
