# mt-conexoes

Sistema web single-tenant que substitui a planilha de um revendedor de assinatura digital — guarda a base com as credenciais de acesso, gera as cobranças de cada ciclo, cobra sozinho no WhatsApp e mostra o lucro por cliente. Mais um site de captação que traz assinante novo por busca orgânica.

Um cliente, R$ 5.000 fechado, 10 semanas, código-fonte entregue.

## Estado atual

Etapa 0 (fundação) concluída: Next.js + Prisma + auth + design system base. Próximo passo é a Etapa 1 de [`docs/projeto/tecnico/07-plano-de-entrega.md`](docs/projeto/tecnico/07-plano-de-entrega.md).

## Duas aplicações

| App | O que é | Stack | Hospedagem |
|---|---|---|---|
| **Painel** | Sistema de gestão. Autenticado, um usuário | Next.js App Router + Prisma | Cloud Run (`southamerica-east1`) |
| **Site** | Captação por busca orgânica. Público, estático | Astro | Cloudflare Pages |

Repositórios, domínios e contas de hospedagem separados — SEO no nicho é adversarial, domínio de captação penalizado não pode derrubar o painel. Única ligação: o formulário do site chama `POST /api/leads` do painel; fora do ar, cai pro WhatsApp, nunca pra tela de erro.

## Stack do painel

- Next.js App Router — Server Components pra ler, Server Actions pra escrever, Route Handlers pra cron
- PostgreSQL (Neon) + Prisma
- Google Cloud Run
- Cloud Scheduler → Route Handler autenticado por OIDC
- Tailwind + shadcn/ui, react-hook-form + Zod

Sem monorepo, sem NestJS, sem RLS/multi-tenancy/RBAC — descartado, recuperável em `git show 3fc471e --stat` só como referência de domínio.

## Rodando localmente

```bash
cp .env.example .env.local
docker compose up -d db
pnpm install
pnpm dlx prisma migrate deploy
pnpm dev
```

Testes:

```bash
pnpm test              # suíte unitária
pnpm test:integration  # suíte de integração — precisa do banco (docker compose up -d db)
```

⚠️ O `docker-compose.yml` mapeia o Postgres no host na porta **5442** (não 5432) — colisão com outro projeto local forçou esse remapeamento. `DATABASE_URL` em `.env.example`/`.env.local` já aponta para `localhost:5442`. Dentro da rede docker o container continua respondendo na 5432 padrão.

⚠️ O Prisma CLI (`prisma migrate deploy`, `prisma generate`, `prisma studio`) **não** lê `.env.local` sozinho — só `.env`. Next.js e o setup dos testes de integração já leem `.env.local`, mas pra rodar comando Prisma direto no terminal, exporte a variável antes:

```bash
export DATABASE_URL=$(grep DATABASE_URL .env.local | cut -d '=' -f2- | tr -d '"')
pnpm dlx prisma migrate deploy
```

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
