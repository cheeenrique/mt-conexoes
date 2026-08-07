# CLAUDE.md

Guia para o Claude Code neste repositório.

## Estado atual

**Só existe `docs/`.** Não há código, `package.json`, lockfile, CI nem migrations. Não invente comandos de build/lint/test nem alegue ter rodado algum.

A especificação está fechada. O próximo passo é a Etapa 0 de [`docs/projeto/tecnico/07-plano-de-entrega.md`](docs/projeto/tecnico/07-plano-de-entrega.md).

Idioma: **pt-BR** em docs, UI e mensagem de erro ao usuário final. Código, identificadores e commits em inglês.

⚠️ O repositório começou como especificação de um SaaS multi-tenant (NestJS, monorepo, RLS, RBAC, ledger de partidas dobradas, ts-rest). **Foi descartada.** Continua recuperável em `git show 3fc471e --stat`, e serve só como referência de domínio — nunca de implementação.

## Regras de código

[`.claude/rules/`](.claude/rules/00-index.md) tem as regras de **como escrever o código** — camadas, Server Components e Actions, transações, banco, frontend, reuso, testes e o checklist de PR. Ler antes de escrever código: este arquivo cobre o **domínio**, aquelas cobrem a **forma**.

---

## O produto em uma frase

Sistema web single-tenant que substitui a planilha de um revendedor de assinatura digital — guarda a base com as credenciais de acesso, gera as cobranças de cada ciclo, cobra sozinho no WhatsApp e mostra o lucro por cliente — **mais um site de captação** que traz assinante novo por busca orgânica.

Um cliente, R$ 5.000 fechado, 10 semanas, código-fonte entregue.

---

## Duas aplicações

| App | O que é | Stack | Doc |
|---|---|---|---|
| **Painel** | O sistema de gestão. Autenticado, um usuário | Next.js App Router + Prisma + Cloud Run | `tecnico/01` a `07` |
| **Site** | Captação por busca orgânica. Público, estático | Astro + Cloudflare Pages | `tecnico/08` |

⚠️ **Repositórios, domínios e contas de hospedagem separados.** SEO neste nicho é espaço adversarial — deindexação por DMCA acontece sem que se tenha feito nada errado. Domínio de captação penalizado não pode derrubar o painel do cliente. Sem DNS em comum.

A única ligação é o formulário do site chamando `POST /api/leads` do painel. **Endpoint fora do ar faz o formulário cair para o WhatsApp**, nunca para uma tela de erro.

## Stack do painel

| Camada | Escolha |
|---|---|
| App | Next.js App Router — Server Components para ler, Server Actions para escrever, Route Handlers para cron |
| Banco | PostgreSQL (Neon) + Prisma |
| Hospedagem | Google Cloud Run, `southamerica-east1` |
| Agendamento | Cloud Scheduler → Route Handler autenticado por OIDC |
| UI | Tailwind + shadcn/ui · react-hook-form + Zod |

**Não existe aqui:** monorepo, Turborepo, NestJS, ts-rest, Graphile Worker, Redis, RLS, multi-tenancy, RBAC, ledger de partidas dobradas.

### Camadas

```
app/       ──> features/  ──> core/, lib/
features/  ──> core/, lib/
core/      ──> nada (nem Prisma, nem Next, nem I/O, nem new Date())
lib/       ──> Prisma, env
```

- **`core/` é puro.** Cálculo de vencimento a partir da data de pagamento (com clamp de fim de mês), arredondamento, desconto, margem e avaliação da régua vivem lá, testáveis em milissegundos. Se uma regra financeira precisa de I/O para ser testada, está no lugar errado.
- **Server Action não contém regra.** Valida com Zod, chama o service, revalida o cache.
- **Uma feature não importa de outra feature.**
- **Nenhum componente cliente recebe `BigInt`.** Converte para string na borda do servidor.

---

## Regras duras (violá-las é bug, não preferência)

**Dinheiro**
- `BigInt` em centavos, sufixo `...Cents`, sempre. Nunca `float`, **nem em variável temporária**. Percentual é `Decimal`.
- Arredondamento *round half up*, em centavos, uma única vez, no fim do cálculo.
- `Charge.costCents` é congelado na emissão e **nunca** recalculado. Relatório de julho não muda porque o fornecedor subiu o preço em agosto.
- ❌ Nenhuma coluna de saldo. Total é sempre `SUM`.
- Cobrança com pagamento registrado não é cancelada nem editada. Correção é registro novo.

**Data e fuso**
- Banco em UTC; vencimento e corte de relatório são conceitos **locais** (`Settings.timezone`).
- Vencimento é `23:59:59` local.
- **Vencimento do próximo ciclo = data do pagamento total do ciclo atual + duração do ciclo**, mesmo dia do mês seguinte. Não existe mais dia fixo por assinatura — o "dia" é sempre o dia em que o cliente pagou. Pagou 05/02 → próxima cobrança vence 05/03, não importa quando a cobrança de fevereiro venceu.
- Fim de mês aplica clamp sobre o dia do pagamento real, sem lembrar de um dia "desejado" entre ciclos: pagou 31/01 → vence 28/02 (fevereiro não tem 31); pagou 28/02 → vence 28/03, não 31/03 — o cálculo usa o dia em que o cliente pagou daquela vez, não um dia fixo guardado na assinatura. O dia 31 só reaparece se o cliente pagar de novo no dia 31 **e** o mês alvo (a contagem de meses do ciclo à frente do pagamento) tiver 31 dias — nunca é automático: pagou 31/07, mensal → mês alvo agosto tem 31 dias → vence 31/08. Cobrança nova só nasce em dois momentos: criação da assinatura (`startedAt + ciclo`) e pagamento total registrado. Pagamento parcial não gera cobrança nova.
- Corte de relatório sai de `monthBoundsUtc(...)`, nunca de `date_trunc('month', ...)` em UTC.

**Idempotência** — cada situação tem o seu mecanismo:

| Situação | Mecanismo |
|---|---|
| Geração de cobrança | `UNIQUE(subscriptionId, periodStart)` + índice único parcial: no máximo uma `Charge` `OPEN`/`OVERDUE`/`PARTIALLY_PAID` por assinatura |
| Passo da régua | `UNIQUE(chargeId, stepId)` em `dunning_executions` |
| Uma mensagem por cliente por dia | Índice único parcial em `messages (customerId, scheduledDate)` |
| Canal padrão único | Índice único parcial em `channel_configs (isDefault)` |

**Régua — travas**
- **T5** opt-out é global por customer, em todos os canais. Conferido na avaliação **e** no despacho.
- **T6** quiet hours 08:00–20:00 no fuso do negócio. Fora da janela, reagenda; não descarta.
- **T7** um customer recebe no máximo uma mensagem de cobrança por dia, consolidada.
- **T8** kill switch com efeito imediato; mensagem parada há mais de 24h vira `CANCELLED` com motivo `stale`.
- A régua é entregue em `REVIEW` — calcula tudo, não envia nada, até o operador ativar na frente de uma lista.

**Providers de WhatsApp**
- Três adapters: `META_CLOUD`, `EVOLUTION`, `SALVY`. O sistema consulta `capabilities`.
- ❌ `if (provider === 'evolution')` fora de `features/messaging/channels`. Se apareceu, o modelo de capabilities está incompleto — corrige o modelo.
- Meta Cloud API só entrega **template aprovado** fora da janela de 24h. Passo sem `metaTemplateName` num canal que exige template vira `SKIPPED`, não uma mensagem que não chega.

**Segurança**
- Senha de acesso do assinante: AES-256-GCM, mascarada na tela, revelação **auditada** em `credential_reveals`, fora de log, Sentry, export e mensagem. O DTO padrão não inclui o campo.
- Credencial de canal nunca volta para o front, nem mascarada.
- Endpoint de cron sem token OIDC devolve 401. Não existe versão "por enquanto sem auth".
- `$queryRawUnsafe` proibido. Só `$queryRaw` parametrizado ou TypedSQL.
- CSV export: escapar célula iniciada por `=`, `+`, `-`, `@`.
- LGPD: direito de eliminação é **anonimização de verdade**, não `deletedAt`. Registros financeiros preservados.
- Sem `console.log` em código de produção. Log é JSON com ids, nunca objetos inteiros.

**Testes** — TDD obrigatório, vermelho antes de verde:
- `src/core/**` — vencimento por data de pagamento (com clamp de fim de mês), ciclo, desconto, arredondamento, margem
- Travas T5–T8
- Idempotência de cada job
- Criptografia de credencial (ida e volta, e falha explícita com chave errada)

Integração roda contra **Postgres real**. Índice parcial e `CHECK` não existem em SQLite — testar sem eles é testar outro sistema. Relógio injetado por parâmetro, nunca mockado globalmente.

Fora dessas áreas: teste junto ou depois, sem cerimônia.

---

## Convenções

| Contexto | Convenção | Exemplo |
|---|---|---|
| Jobs / rotas de cron | `dominio-acao` | `dunning-evaluate` |
| Tabelas | `snake_case` plural | `dunning_executions` |
| Modelos Prisma | `PascalCase` singular | `DunningExecution` |
| Dinheiro | sufixo `Cents`, tipo `BigInt` | `principalCents` |
| Datas | sufixo `At`, UTC | `dueAt`, `paidAt` |
| IDs | `uuid` v7 | — |
| Rotas da UI | pt-BR, plural | `/clientes/:id`, `/cobrancas` |

**Vocabulário** — `Customer` é o assinante final do cliente. `User` é quem acessa o painel (existe **um**). `Plan` é o pacote comercial. `Supplier` é o fornecedor do crédito revendido. `Charge` é a cobrança de um ciclo; `Payment` é o dinheiro que entrou. Conceito com outro nome em qualquer lugar é bug de nomenclatura.

## Orçamento de tamanho

| Artefato | Limite |
|---|---|
| Server Action | 30 linhas |
| Service (arquivo) | 250 linhas |
| Função em `core/` | 40 linhas |
| Componente React | 150 linhas |
| `page.tsx` | 100 linhas |

Estourar é sinal de split por responsabilidade, nunca de subir o limite.

---

## Onde procurar o quê

Índice em [`docs/projeto/README.md`](docs/projeto/README.md).

- Stack, pastas, camadas, cron, auth → `docs/projeto/tecnico/01-arquitetura.md`
- Schema Prisma + **SQL manual das migrations** → `docs/projeto/tecnico/02-modelo-de-dados.md`
- Âncora de fim de mês, ciclos, fuso, casos de teste → `docs/projeto/tecnico/03-datas-e-ciclos.md`
- `BigInt`, arredondamento, lucro, margem em risco, queries → `docs/projeto/tecnico/04-dinheiro-e-margem.md`
- Criptografia, auth, logs, LGPD, backup → `docs/projeto/tecnico/05-credenciais-e-seguranca.md`
- Motor da régua, travas, os 3 adapters → `docs/projeto/tecnico/06-regua-e-canais.md`
- Etapas, critérios de pronto, riscos → `docs/projeto/tecnico/07-plano-de-entrega.md`
- Site: Astro, arquitetura de conteúdo, SEO técnico, conversão, CWV → `docs/projeto/tecnico/08-site.md`
- Escopo contratado e o que é R$ 150/h → `docs/projeto/comercial/02-precificacao.md`

Marcadores nos docs: ⚠️ = requisito de segurança, não cortável. 🔮 = fora do escopo, **não implementar sem pedido explícito**.

---

## Prioridade de esforço

**Financeiro > régua > importação > resto.**

Nenhum cliente abandona o sistema por causa da ORM ou do framework. O que decide é o saldo bater, a régua não mandar cobrança duplicada, e a margem estar certa.
