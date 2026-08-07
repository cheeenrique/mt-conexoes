# Etapa 0 — Fundação + design system

> Spec de implementação da Etapa 0 do plano de entrega (`docs/projeto/tecnico/07-plano-de-entrega.md`),
> incorporando o handoff de design `Painel MT Conexões.dc.html` (design_handoff_painel, fora do
> repositório — arquivo original em `~/Downloads/MT Conexões.zip`).
>
> Escopo: bootstrap do painel, ambiente docker local, design system (tokens + componentes base) e
> convenções transversais (formulário, resposta de API, toast, i18n). **Nenhuma tela de CRUD
> (Clientes, Cobranças etc.) é implementada nesta etapa** — isso é Etapa 1 em diante.

## Nome do projeto

`mt-conexoes` em: `package.json` (`name`), nomes de serviço no `docker-compose.yml`, header
`X-App-Name` em toda resposta de erro de API/Server Action.

## 1. Docker local

`docker-compose.yml` na raiz:

- **`db`** — Postgres 16, porta 5432, volume nomeado `mt-conexoes-db-data`, healthcheck
  (`pg_isready`). `DATABASE_URL` de dev e dos testes de integração (Vitest) aponta pra ele.
- **`cron-sim`** — container leve (`node:alpine` + script de loop com `curl`) que chama
  `POST /api/cron/*` do app (`host.docker.internal:3000`) periodicamente em dev, simulando o
  Cloud Scheduler. Autenticação em dev via `CRON_SECRET` fixo em `.env`; produção continua com
  OIDC real, sem relação com este container.

`.env.example` com `DATABASE_URL`, `CRON_SECRET`, `CRYPTO_KEY` (dev), `SESSION_SECRET`.

## 2. Bootstrap do app

- Next.js App Router + TypeScript + Tailwind + shadcn/ui.
- Prisma + Neon (dev aponta pro Postgres do docker) — schema inicial só com `User`
  (autenticação), primeira migration.
- `src/core/money.ts` — arredondamento *round half up* em centavos. `src/core/dates.ts` —
  `nextDueDate` com clamp de fim de mês. **TDD, vermelho antes de verde**, casos cobertos:
  `docs/projeto/tecnico/03-datas-e-ciclos.md`.
- Auth: login (Server Action, Zod), sessão em cookie httpOnly, middleware protegendo o grupo
  `(app)`, troca de senha. Usuário único, sem cadastro público — igual à tela de Login do
  handoff (e-mail + senha, erro "E-mail ou senha não conferem.").
- `lib/crypto.ts` — AES-256-GCM. Teste de ida e volta e falha explícita com chave errada.
- Vitest configurado: unit (rápido, sem I/O) + integração (contra Postgres real do docker).
- `/api/health` — Route Handler simples, sem auth.
- Dockerfile + config de Cloud Run **preparados mas sem deploy real** nesta etapa — não há
  projeto GCP do cliente ainda. Logs em JSON estruturado desde o início.

## 3. Design system

Tokens extraídos do handoff, aplicados via `tailwind.config` (`theme.extend`):

- **Cores**: fundo `#0B0B0C`, superfície `#141417`, superfície elevada `#1D1D21`, borda
  `#2B2B31`, borda destaque `#3A3A42`, texto `#F7F5F3`, texto secundário `#A3A3AB`, texto
  desabilitado `#4B4B54`, marca `#EA580C` / `#F97316`, verde `#4ADE80`, amarelo `#FBBF24`,
  vermelho `#F87171`. Badges translúcidos nas mesmas cores em `rgba(...,.12–.14)`.
- **Tipografia**: Nunito (400–900, interface inteira) e IBM Plex Mono (400–600, **só** dinheiro,
  data, hora, telefone, ID, credencial, paginação — sempre `font-variant-numeric: tabular-nums`),
  via `next/font`.
- **Espaçamento**: escala 4/6/8/10/12/14/16/20/24/28px. Padding de conteúdo
  `clamp(16px,3vw,28px)`.
- **Raio**: 10px (card/seção/botão/drawer), 4px (input/badge/chip/botão-ícone), 50% (status/passo).
- **Alturas fixas**: header 64 · item de menu 40 · linha de tabela 44 · input 44 · botão
  principal 40 (44 em drawer) · botão-ícone 32×32 · badge 24. Alvo de toque mobile 44px.
- **Breakpoint único**: 900px (sidebar vira gaveta, `<table>` vira lista de cards).
- **Foco visível**: `outline: 2px solid #F97316; outline-offset: 2px`.
- `prefers-reduced-motion: reduce` desliga animação/transição.

### Componentes base (`components/ui/`, sem domínio, recebem tudo por prop)

- `CurrencyInput`, `PhoneInput`, `DateInput` — `react-imask` + `Controller` do RHF. Trabalham
  em centavos/E.164/Date na borda, nunca `number` solto pro form.
- `DataTable` genérica — cabeçalho uppercase 12px/600, linha 44px, coluna numérica à direita em
  mono tabular, paginação (8/12/20 por página), vira cartões abaixo de 900px.
- `Drawer` (larguras 480/520/560px conforme conteúdo), `ConfirmDialog`, `StatusBadge` (variant
  por faixa de cor), `MaskedSecret` (campo credencial com `eye`/`eye-off` + `copy`, auditoria é
  responsabilidade de quem consome, não do componente), `EmptyState`, `Skeleton`.
- Ícones: Lucide, mesmo set do handoff.
- Casca do app: `Sidebar` (240px, itens do handoff, kill switch no rodapé), `Header` (título +
  ação primária + botão `menu` <900px), faixa de pausa condicional. Sem conteúdo de tela ainda.

## 4. Formulário padrão

- `react-hook-form` + `zodResolver`, **mesmo schema** usado na Server Action correspondente.
- Campo de dinheiro é sempre `CurrencyInput` — proibido `parseFloat` em valor digitado.
- Campo de telefone é sempre `PhoneInput` — máscara de exibição, E.164 armazenado.
- Botão de submit desabilita durante a mutation.
- Erro do servidor: `DomainError.code` mapeado pro campo via `setError` quando fizer sentido;
  resto vira toast.

## 5. Convenção de resposta, erro, toast e i18n

- **Sucesso**: DTO puro (`{ paymentId }`), sem envelope.
- **Erro**: sempre `{ error: { code, message } }`, `message` pronto em pt-BR pra exibir direto.
- `lib/messages.ts` — dicionário plano por domínio (`messages.auth.invalidCredentials`,
  `messages.charges.paymentRegistered`, `messages.common.unexpectedError`...). Sem lib de i18n
  (`next-intl` etc.) — projeto é pt-BR único, sem previsão de outro idioma (YAGNI).
- Toast via `sonner`. Sucesso usa string de `messages.*`; erro usa `error.message` do
  `DomainError` devolvido pela action, com fallback em `messages.common.unexpectedError` pra
  erro inesperado.
- Log: JSON estruturado, nunca objeto inteiro — regra já existente em `.claude/rules/02-servidor.md`.

## Fora do escopo desta etapa

Qualquer tela de CRUD (Clientes, Cobranças, Mensagens, Réguas, Leads, Fornecedores, Planos,
Ajustes, Relatórios), schema Prisma além de `User`, adapters de WhatsApp, jobs de negócio
(`dunning-evaluate`, `charges-mark-overdue` etc.), deploy real no Cloud Run. Essas entram nas
Etapas 1–5 do plano de entrega, cada uma com seu próprio spec.

## Critério de pronto

- `docker compose up` sobe `db` saudável.
- `pnpm test` verde: `core/money`, `core/dates` (casos de `03-datas-e-ciclos.md`),
  `lib/crypto` (ida/volta + chave errada).
- Login funciona ponta a ponta contra o Postgres do docker.
- `/api/health` responde 200.
- Sidebar/Header renderizam com os tokens do handoff, responsivo em 900px.
- Um formulário de exemplo (ex.: troca de senha) usa `CurrencyInput`/`PhoneInput` conforme
  aplicável, RHF+Zod, toast de sucesso/erro via `sonner` + `lib/messages.ts`.
