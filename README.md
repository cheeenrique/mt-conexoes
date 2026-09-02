# mt-conexoes

Sistema web single-tenant que substitui a planilha de um revendedor de assinatura digital — guarda a base com as credenciais de acesso, gera as cobranças de cada ciclo, cobra sozinho no WhatsApp e mostra o lucro por cliente. Mais um site de captação que traz assinante novo por busca orgânica.

Um cliente, R$ 5.000 fechado, 10 semanas, código-fonte entregue.

## Estado atual

Ver [`CLAUDE.md`](CLAUDE.md#estado-atual) — este README fica desatualizado facilmente porque várias etapas são desenvolvidas em paralelo (um worktree por etapa) e mergeadas direto em `main`. Histórico real de cada etapa: [`docs/superpowers/specs/`](docs/superpowers/specs/) e [`docs/superpowers/plans/`](docs/superpowers/plans/).

## Duas aplicações

| App | O que é | Stack | Hospedagem |
|---|---|---|---|
| **Painel** | Sistema de gestão. Autenticado, um usuário | Next.js App Router + Prisma | Cloud Run (`southamerica-east1`) |
| **Site** | Captação por busca orgânica. Público, estático | Astro | Cloudflare Pages |

Repositórios, domínios e contas de hospedagem separados — SEO no nicho é adversarial, domínio de captação penalizado não pode derrubar o painel. Única ligação: o formulário do site chama `POST /api/leads` do painel; fora do ar, cai pro WhatsApp, nunca pra tela de erro.

## Stack do painel

- Next.js App Router — Server Components pra ler, Server Actions pra escrever, Route Handlers pra cron
- PostgreSQL (Cloud SQL) + Prisma
- Google Cloud Run
- Cloud Scheduler → Route Handler autenticado por OIDC
- Tailwind + shadcn/ui, react-hook-form + Zod

Sem monorepo, sem NestJS, sem RLS/multi-tenancy/RBAC — descartado, recuperável em `git show 3fc471e --stat` só como referência de domínio.

## Rodando localmente

```bash
cp .env.example .env.local
docker compose up -d db
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Quer ver o painel com dado de exemplo (fornecedor + planos reais)? `pnpm db:seed:demo`. **Só no banco de dev** — ver aviso abaixo e [`prisma/README.md`](prisma/README.md#dois-bancos-dev-e-teste).

Testes:

```bash
docker compose up -d db-test   # banco de integração, separado do de dev
pnpm db:migrate:test
pnpm db:seed:test              # usuário/settings/régua padrão que as suítes esperam já existir
pnpm test                      # suíte unitária
pnpm test:integration          # suíte de integração — roda contra db-test, nunca contra db
```

⚠️ **Dois Postgres, nunca o mesmo para dev e teste.** `db` (porta **5442**) é o que `pnpm dev` usa; `db-test` (porta **5443**) é isolado, só `pnpm test:integration` usa. Semear dado de demonstração no de teste quebra a suíte de forma não determinística — detalhe completo em [`prisma/README.md`](prisma/README.md#dois-bancos-dev-e-teste). Dentro da rede docker os dois containers respondem na 5432 padrão.

⚠️ O Prisma CLI não lê `.env.local` sozinho — só `.env`. `pnpm db:migrate`, `pnpm db:seed` e os equivalentes `:test`/`:demo` já carregam `.env.local` por conta própria; use esses scripts em vez de chamar `prisma`/`tsx` direto no terminal.

## Documentação

Índice completo em [`docs/projeto/README.md`](docs/projeto/README.md).

| Área | Doc |
|---|---|
| Regras de código (camadas, Server Components/Actions, testes) | [`.claude/rules/`](.claude/rules/00-index.md) |
| Regras duras de domínio (dinheiro, data, régua, credencial) | [`CLAUDE.md`](CLAUDE.md) |
| Arquitetura, schema, ciclos, dinheiro, segurança, régua | `docs/projeto/tecnico/01` a `06` |
| Plano de entrega | `docs/projeto/tecnico/07-plano-de-entrega.md` |
| Site de captação | `docs/projeto/tecnico/08-site.md` |
| Escopo comercial | `docs/projeto/comercial/` |

Idioma: pt-BR em docs, UI e mensagem ao usuário final. Código, identificadores e commits em inglês.
