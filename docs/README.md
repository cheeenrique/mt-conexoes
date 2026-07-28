# Documentação do Produto — SaaS de Gestão, Cobrança e Automação

> **Status:** v0.1 — documento vivo. Stack e decisões de domínio fechadas.
> **Última revisão:** 28/07/2026

---

## Índice

| # | Documento | Conteúdo |
|---|---|---|
| 01 | [Visão de produto](./01-visao-produto.md) | Posicionamento, ICP, riscos, métricas, não-objetivos |
| 02 | [Glossário de domínio](./02-glossario.md) | Linguagem ubíqua — leia antes de tudo |
| 03 | [Arquitetura e ADRs](./03-arquitetura-e-adrs.md) | Stack, monorepo, deploy, decisões registradas |
| 04 | [Multi-tenancy, Auth e RBAC](./04-multitenancy-auth-rbac.md) | Isolamento, sessão, permissões, LGPD |
| 05 | [Modelo de dados](./05-modelo-de-dados.md) | Schema Prisma completo + constraints |
| 06 | [Assinaturas e ciclo de vida](./06-assinaturas-ciclo-de-vida.md) | Máquinas de estado, pré/pós-pago, trial |
| 07 | [Financeiro e ledger](./07-financeiro-ledger.md) | Partidas dobradas, cobrança, pagamento, multa/juros |
| 08 | [Eventos e jobs](./08-eventos-e-jobs.md) | Catálogo de eventos, outbox, Graphile Worker |
| 09 | [Régua de cobrança](./09-regua-de-cobranca.md) | Motor, réguas padrão, travas de segurança |
| 10 | [Integrações de pagamento](./10-integracoes-pagamento.md) | Pix manual, Mercado Pago, PagBank |
| 11 | [Integrações de canais](./11-integracoes-canais.md) | WhatsApp (Meta, Salvy, Evolution), e-mail |
| 12 | [Onboarding](./12-onboarding.md) | Checklist, progresso, autoteste |
| 13 | [Importação de planilha](./13-importacao-planilha.md) | Pipeline de 9 fases, mapeamento, rollback |
| 14 | [API e contratos](./14-api-contratos.md) | ts-rest, padrões de erro, idempotência |
| 15 | [Billing do próprio SaaS](./15-billing-do-saas.md) | Planos, limites, enforcement |
| 16 | [Roadmap e MVP](./16-roadmap-mvp.md) | Fases, cortes, critérios de pronto |
| 17 | [Custos, margem e fornecedores](./17-custos-margem-e-fornecedores.md) | COGS, lucro por cliente e geral, campos personalizados |

---

## Decisões travadas

| Camada | Escolha |
|---|---|
| Front (painel) | React + Vite (SPA) + TanStack Router/Query + Tailwind + shadcn/ui |
| Contrato | ts-rest + Zod em `packages/contracts` (sem codegen) |
| Back | NestJS + Prisma 7 (driver adapter, TypedSQL) |
| Assíncrono | Graphile Worker — mesmo codebase, processo separado |
| Dados | PostgreSQL — RLS, `BigInt` em centavos, `jsonb` onde couber |
| Monorepo | pnpm workspaces + Turborepo |
| Site institucional | Astro (estático, Cloudflare Pages) |
| Infra | Cloudflare Pages + Railway + Neon/Supabase — região São Paulo |

| Domínio | Escolha |
|---|---|
| ICP | PMEs com cobrança recorrente; GTM inicial em provedores de assinatura |
| Modelo de cobrança | Híbrido: pré-pago e pós-pago no mesmo motor |
| Tenant | PF ou PJ. **Sem hierarquia de sub-revenda** — cada revenda é um tenant |
| Vencimento | Individual por assinatura (sem ciclo comum) |
| Preço | Definido na assinatura; plano é apenas sugestão |
| Credenciais | BYO — tenant usa suas próprias contas de gateway e canal |
| Suspensão | MVP: mudança de status + notificação (sem corte técnico) |
| Portal do assinante | Documentado, **fora do MVP** |
| Billing do SaaS | Valor fixo por plano de recursos |
| Custo e lucro | Rastreados por assinatura; visão por cliente e agregada (doc 17) |

---

## Convenções do repositório de docs

- Toda decisão relevante vira **ADR** em `03-arquitetura-e-adrs.md`. Se mudou de ideia, não edite o ADR — escreva um novo que o supersede.
- Termos em **negrito** na primeira ocorrência remetem ao [glossário](./02-glossario.md).
- Blocos marcados com ⚠️ são **requisitos de segurança** — não podem ser cortados por prazo.
- Blocos marcados com 🔮 são fora do MVP, registrados para não perder o raciocínio.
