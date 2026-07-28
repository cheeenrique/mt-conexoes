# 03 — Arquitetura e ADRs

## Visão geral

```
                         Cloudflare
                              |
      +-----------------------+------------------------+
      |                       |                        |
 www.meusaas.com        app.meusaas.com          api.meusaas.com
   Astro (estático)      React + Vite (SPA)        NestJS (HTTP)
   Cloudflare Pages      Cloudflare Pages          Railway
                              |                        |
                              +-----> ts-rest <--------+
                                                       |
                                              +--------+--------+
                                              |                 |
                                        PostgreSQL         Worker (NestJS)
                                        (Neon/Supabase)    Graphile Worker
                                         RLS ativo          Railway
                                              |                 |
                                              +--------+--------+
                                                       |
                                          Providers externos (BYO)
                                   Meta / Salvy / Evolution / Resend
                                      Mercado Pago / PagBank / Pix
```

**Ponto central:** `api` e `worker` são **o mesmo codebase NestJS** com entrypoints diferentes (`main.ts` e `worker.ts`). Isso garante que a regra de negócio executada pela automação seja *literalmente a mesma* executada pela UI. Nunca duplicar cálculo financeiro entre os dois.

## Monorepo

```
apps/
  api/          NestJS — src/main.ts (HTTP) | src/worker.ts (jobs)
  web/          Vite + React — painel administrativo
  site/         Astro — institucional, blog, docs públicas
  portal/       🔮 Fase 3 — portal do assinante
packages/
  contracts/    ts-rest + Zod — fonte única do contrato de API
  db/           Prisma schema, migrations, client gerado, TypedSQL
  core/         regras de domínio puras (cálculo de juros, proração, datas)
  ui/           design system: tokens, shadcn/ui, componentes
  config/       tsconfig, eslint, tailwind preset
```

**Regra dura:** `packages/core` não importa Prisma, NestJS nem HTTP. São funções puras testáveis em milissegundos. Cálculo de multa, juros, proração, próximo vencimento e alocação de pagamento vivem aqui.

**Docker no Railway:** usar `turbo prune --scope=api --docker` para não copiar o monorepo inteiro na imagem.

## Ambientes

| Ambiente | Front | API | Banco |
|---|---|---|---|
| local | `localhost:5173` | `localhost:3000` | Postgres em Docker |
| staging | `staging.meusaas.com` | `api-staging.meusaas.com` | branch do Neon |
| produção | `app.meusaas.com` | `api.meusaas.com` | Neon/Supabase — região `sa-east-1` |

⚠️ Toda infra em **São Paulo**. API em outra região adiciona ~200ms por request e vira reclamação de lentidão.

## Observabilidade

- **Sentry** em `web`, `api` e `worker`, com `tenantId` e `userId` como tags (nunca dados pessoais no payload)
- **Better Stack** para uptime de `api.meusaas.com/health` e log agregado
- **Logs estruturados** JSON com `requestId`, `tenantId`, `userId`, `route`, `durationMs`
- **Health check profundo** em `/health/deep`: banco, fila (jobs pendentes/atrasados), providers

**Alertas mínimos:** jobs atrasados > 5 min · taxa de erro de envio > 10% · webhook de gateway falhando · latência p95 > 1s.

## Backup e recuperação

- PITR do provedor de Postgres (mínimo 7 dias)
- ⚠️ **Restore testado trimestralmente em staging.** Backup não testado não é backup.
- Export completo de dados do tenant sob demanda (obrigação LGPD e antídoto contra lock-in percebido)

---

# ADRs

Formato: contexto → decisão → consequências. Decisão superada não se edita; escreve-se outra que a supersede.

## ADR-001 — PostgreSQL em vez de MongoDB

**Contexto:** sistema financeiro multi-tenant com ledger, conciliação e relatórios agregados.

**Decisão:** PostgreSQL.

**Motivos:** (a) enfileirar job na **mesma transação** da mudança de estado — sem isso, cobrança criada pode ficar sem régua agendada; (b) invariantes no banco (`EXCLUDE USING gist` para períodos não sobrepostos, `CHECK`, FK, índice único para idempotência); (c) **RLS** como isolamento de tenant no próprio banco, não na disciplina do código; (d) relatório financeiro é join + window function.

**Consequências:** migrations com SQL manual para RLS e constraints avançadas; ganho de garantias fortes onde erro é caro.

## ADR-002 — Prisma 7 em vez de Drizzle

**Contexto:** ORM para Postgres com NestJS, dev solo.

**Decisão:** Prisma 7 com `engineType = "client"` (sem Rust) e `@prisma/adapter-pg`.

**Motivos:** migrations com shadow DB e detecção de drift; TypedSQL cobre relatórios com SQL tipado; Prisma Studio para suporte; ecossistema NestJS maduro; a desvantagem histórica de bundle/cold start foi resolvida na v7.

**Consequências:** RLS, `EXCLUDE`, índices parciais e particionamento entram como SQL manual nas migrations — `schema.prisma` deixa de ser fonte única da verdade. Documentar isso no README de `packages/db`. Enfileirar job dentro de transação exige `$executeRaw` chamando `graphile_worker.add_job`.

## ADR-003 — Graphile Worker em vez de BullMQ/Redis

**Contexto:** régua com esperas de dias, retry, agendamento.

**Decisão:** Graphile Worker sobre o próprio Postgres.

**Motivos:** transacionalidade com os dados de negócio; uma peça de infra a menos; carga projetada (~1M jobs/mês ≈ 0,4/s médio) está duas ordens de grandeza abaixo do limite.

**Consequências:** rate limit de envio precisa ser implementado manualmente (token bucket em tabela). Trocar por BullMQ depois é refactor de ~2 dias atrás de uma interface — mantenha `QueueService` como abstração.

## ADR-004 — React + Vite (SPA) em vez de Next.js

**Contexto:** painel 100% autenticado; worker longo-vivo obrigatório de qualquer forma.

**Decisão:** Vite SPA.

**Motivos:** sem SEO em área logada, RSC e `"use client"` só adicionariam atrito; HMR instantâneo; deploy estático em edge, custo ~zero; componentes gerados por ferramenta de design colam sem fronteira server/client. Next fullstack não elimina o segundo deployable porque o worker existe de qualquer jeito, e ainda espalharia regra de negócio entre server actions e worker.

**Consequências:** roteamento via TanStack Router (file-based, com type safety de params/search).

## ADR-005 — ts-rest em vez de tRPC ou OpenAPI+codegen

**Contexto:** type safety ponta a ponta, mas com webhooks de PSP, webhook da Meta e futura API pública.

**Decisão:** ts-rest com contratos Zod em `packages/contracts`.

**Motivos:** tipos ponta a ponta sem codegen; rotas HTTP reais (guards e interceptors do NestJS funcionam normalmente); OpenAPI gerado do mesmo contrato quando o integrador aparecer. tRPC amarraria o produto a um protocolo que só o próprio front fala, e seu batching atrapalha rate limit e idempotência por rota.

## ADR-006 — Tenant no JWT, sem slug no painel

**Contexto:** URL do painel administrativo.

**Decisão:** `app.meusaas.com` sem identificador de tenant na URL. Contexto vem do token.

**Motivos:** um usuário pode pertencer a vários tenants; path-based (`/tenant-a`) compartilha a mesma origem — cookie e `localStorage` de A alcançáveis por XSS em B; um certificado e um deploy. Autorização nunca deriva da URL.

**Superseded by:** nada. Portal do assinante usa subdomínio por tenant — ver ADR-007.

## ADR-007 — Subdomínio para o portal do assinante 🔮

**Contexto:** o assinante final não conhece nossa marca; link com domínio desconhecido em mensagem de cobrança tem baixa conversão e parece golpe.

**Decisão:** `{slug}.meusaas.com` para o portal; domínio próprio via CNAME em plano superior (Cloudflare for SaaS).

**Consequências:** wildcard TLS para subdomínios; certificado por domínio para custom hostname (feature real de engenharia, fase 3); slug com reservados, cooldown de troca e histórico para redirect 301.

## ADR-008 — Dinheiro como `BigInt` em centavos

**Decisão:** todo valor monetário é `BigInt` de centavos, nomeado `...Cents`. Percentuais são `Decimal`.

**Consequências:** definir replacer global de `BigInt` na serialização JSON; `packages/core` expõe helpers de arredondamento (*round half up*).

## ADR-009 — BYO credentials

**Decisão:** o tenant conecta as contas dele nos providers de pagamento e mensagem. Não intermediamos dinheiro nem mensagem.

**Motivos:** elimina repasse de custo e responsabilidade por saldo de terceiro; reduz exposição ao risco R1; dispensa cadastro nosso como PSP.

**Consequências:** onboarding mais trabalhoso (wizard passo a passo por provider é obrigatório, não opcional); não temos receita de transação.

## ADR-010 — Suspensão sem corte técnico no MVP

**Decisão:** suspender assinatura altera status e notifica; não desliga acesso em sistema externo.

**Motivos:** integração com painel de streaming é o ponto de maior sensibilidade do risco R1 e adiciona superfície de suporte grande.

**Consequências:** o tenant executa o corte manualmente a partir de uma lista de pendências. Gancho documentado para integração futura.

## ADR-011 — Sem hierarquia de sub-revenda

**Decisão:** cada revenda é um tenant independente. Sem `parentTenantId`, sem comissionamento, sem visão consolidada.

**Motivos:** hierarquia contamina RLS, permissões, relatórios e billing. Complexidade alta para demanda não validada.

**Consequências:** se um dia for necessário, entra como conceito novo (`Organization` acima de `Tenant`), não como campo em `Tenant`.

## ADR-012 — Sem motor visual de workflow no MVP

**Decisão:** régua de cobrança parametrizável em vez de engine genérico tipo n8n.

**Motivos:** engine genérico com versionamento, rollback e canvas é 6–12 meses; a régua entrega ~90% do valor com ~10% do custo. O barramento de eventos (ADR/doc 08) fica pronto desde o dia 1, então o engine futuro se apoia nele sem reescrita.

**Consequências:** documentar em 09 os pontos de extensão que o engine futuro consumirá.
