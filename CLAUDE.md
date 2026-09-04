# CLAUDE.md

Guia para o Claude Code neste repositório.

## Estado atual

Aplicação real, rodando. Next.js 16 (App Router) + React 19 + Prisma + Postgres. `pnpm test`, `pnpm test:integration`, `pnpm lint`, `pnpm typecheck` e `pnpm build` rodam contra código real; `pnpm dev` sobe o painel. Conferido em 27/08/2026: 548 testes unitários e 275 de integração passando (96 arquivos, 18 migrations).

**Existe** — as features `auth`, `charges`, `customers`, `dunning`, `leads`, `messaging`, `plans`, `reports`, `settings`, `subscriptions`, `suppliers` em `src/features/`, e as telas Início, Clientes (ficha em gaveta, com modo edição), Cobranças, Mensagens, Réguas (mestre-detalhe), Leads, Relatórios, Fornecedores, Planos, Ajustes (abas Negócio e Canais) e Conta. Crons: `charges-mark-overdue`, `dunning-evaluate`, `messages-dispatch`, `ping`. Rotas públicas: `POST /api/leads`, os webhooks `evolution` e `meta-cloud`, `/api/health`.

Quatro coisas que a estrutura não deixa óbvias: **assinatura não tem rota própria** — vive na ficha do cliente (`/customers/[id]`); **não existe `/channels`** — canal é a aba `Canais` de `/settings?aba=canais`; **a régua está em `/dunning`**, não mais em `/regua`; e **`/conta` é item de menu que abre em gaveta**, não link — a rota segue existindo para link direto, mas o caminho normal é o botão `Conta` da barra lateral (`features/auth/components/account-drawer.tsx`). A **importação da planilha** tem dois caminhos pra mesma regra: a tela, em rota própria (`/customers/import`, alcançada por Clientes → **Importar planilha**) com **duas etapas** — escolher fornecedor e arquivo, depois conferir o plano (novas · já existem · recusadas, soma, margem média, tabela linha a linha) **sem gravar nada**; só o botão final grava, e o arquivo escolhido é reenviado do navegador na confirmação, sem ficar guardado no servidor entre as duas etapas — e o CLI (`pnpm import:customers <arquivo.xlsx> "<Fornecedor>"`, que segue existindo e faz upsert do fornecedor pelo nome). Os três pontos de entrada (prévia, confirmação, CLI) chamam `app/(app)/customers/customer-import.ts` — nenhuma regra de linha duplicada.

**Dois Postgres locais**, nunca o mesmo: `db` na 5442 (dev) e `db-test` na 5443 (`pnpm test:integration`), com scripts próprios — ver [`prisma/README.md`](prisma/README.md). `infra/evolution/` sobe a stack Docker do canal não oficial, com a imagem fixada; é separada do `docker-compose.yml` da raiz.

**O que ainda não está pronto** — está aqui porque um documento que promete mais do que o código entrega é pior que um desatualizado:

- **`META_CLOUD` é configurável e não entrega.** O adapter monta o POST de template, mas nenhum ponto do despacho preenche `templateRef`: `send()` recusa sempre, com "Passo sem template aprovado". Marcar esse canal como padrão hoje é ficar sem envio.
- **Pareamento por QR nunca foi visto conectando de verdade** — exige um WhatsApp real lendo o código. O caminho `open` tem teste, não observação.
- **"Ativar sem descartar a revisão" não dispara retroativo.** `UNIQUE(chargeId, stepId)` impede reprocessar o par, então nenhuma daquelas mensagens sai. O rótulo do botão já é honesto (o handoff chamava de "Enviar todas"); o comportamento certo é decisão de produto em aberto.
- **Turnstile implementado e desligado por padrão** (`features/leads/turnstile.ts`): sem `TURNSTILE_SECRET_KEY`, passa direto. O rate limit por IP em `lead_attempts` continua valendo.
- **CORS de `/api/leads` aberto (`*`)** enquanto `LEADS_ALLOWED_ORIGINS` estiver vazia — temporário, até o site ter domínio. Sem `allow-credentials`; quem protege o endpoint é o Zod estrito, o teto de 8 KB no corpo, o rate limit e o Turnstile.

Histórico de cada etapa entregue (design → plano → implementação) fica em [`docs/superpowers/specs/`](docs/superpowers/specs/) e [`docs/superpowers/plans/`](docs/superpowers/plans/), um par de arquivos datado por etapa/feature. ⚠️ O par mais recente é de 13/08; a leva de 22/08 (Mensagens, Leads, Réguas mestre-detalhe, pareamento por QR, remoção do Salvy, split dos bancos) não tem spec nem plano — para essa parte, `git log --oneline` é a fonte, não `docs/superpowers/`.

⚠️ **Este arquivo e o `README.md` já ficaram desatualizados antes** — chegaram a dizer "só existe docs/, sem código" com o app inteiro já implementado e rodando, porque múltiplas sessões trabalham em paralelo neste repo (worktrees por etapa) e ninguém atualizou esta seção depois do merge. Antes de assumir o que existe ou não: `git log --oneline -30`, ou olhar `src/features/` e `prisma/schema.prisma` direto. Não repetir esse erro — se implementar algo novo, atualizar este parágrafo no mesmo PR.

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

A única ligação é o formulário do site chamando `POST /api/leads` do painel — já implementado. **Endpoint fora do ar faz o formulário cair para o WhatsApp**, nunca para uma tela de erro.

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
- **Uma feature não importa de outra feature.** Quem cruza duas features é `app/` — a rota, ou uma action de composição ao lado dela (`app/(app)/customers/ficha-action.ts`, `app/api/cron/dunning-evaluate/route.ts`).
- **Sessão e configuração moram em `lib/`**, não numa feature: `requireSession()` em `lib/auth.ts`, `getSettings()` em `lib/settings.ts`. Feature nenhuma reexporta os dois.
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
| Régua padrão única | Índice único parcial em `dunning_rules (isDefault)` |

**Régua — travas**
- **T5** opt-out é global por customer, em todos os canais. Conferido na avaliação **e** no despacho.
- **T6** quiet hours no fuso do negócio — janela configurável em Ajustes, padrão 08:00–20:00. Fora dela, reagenda; não descarta.
- **T7** um customer recebe no máximo uma mensagem de cobrança por dia, consolidada.
- **T8** kill switch com efeito imediato; mensagem parada há mais de 24h vira `CANCELLED` com motivo `stale`.
- Régua nasce `DRAFT` e o motor nem a avalia. `DRAFT → REVIEW → ACTIVE`, sem atalho: em `REVIEW` calcula tudo e não envia nada, e ativar exige a decisão sobre retroativos na frente da lista real do que sairia hoje.
- Existem **várias** réguas, uma padrão. O cron avalia só a padrão; **`activateDunningRule` recebe o `id` que o operador tinha na tela**, nunca resolve por `isDefault` — revisar a régua B e ativar a A é silencioso.

**Providers de WhatsApp**
- Dois adapters: `META_CLOUD` e `EVOLUTION`. O sistema consulta `capabilities`. `SALVY` foi removido do produto — o valor continua no enum do Postgres, sem adapter, e `resolveAdapter` falha alto se alguma linha antiga apontar para ele (ver `prisma/README.md`).
- ❌ `if (provider === 'evolution')` fora de `features/messaging/channels`. Se apareceu, o modelo de capabilities está incompleto — corrige o modelo.
- **Como conectar** também é declarado pelo adapter, não perguntado à tela: `ChannelDescriptor.connectionMethods` lista os caminhos (`PAIRING` por QR, `CREDENTIALS` coladas à mão), cada um com seus requisitos, passos e campos. A Evolution declara os dois; a Meta, só o manual. Caminho `PAIRING` exige adapter implementando `PairableChannel` (`channels/pairing.ts`) — contrato **opcional**, fora de `ChannelAdapter`, porque a Meta não parea por QR e obrigá-la a lançar violaria LSP.
- No pareamento por QR, `instanceName` e `webhookToken` são **gerados pelo painel**, e endereço do servidor/chave de API vêm de `EVOLUTION_BASE_URL`/`EVOLUTION_API_KEY` (env — a agência já provisionou o servidor no deploy) — o operador só digita o número que vai enviar. Os quatro viram chaves do mesmo blob criptografado. O caminho `CREDENTIALS` ("já tenho uma instância pareada") continua pedindo endereço e chave: pode ser um servidor diferente do provisionado. `ChannelConfig.phoneNumber` vem do `wuid` que o `connection.update` reporta ao conectar, nunca de campo digitado.
- ⚠️ QR e código de pareamento não são persistidos nem logados: Server Action → prop → `<img>`, morrem com o diálogo.
- Meta Cloud API só entrega **template aprovado** fora da janela de 24h. Passo sem `metaTemplateName` num canal que exige template vira `SKIPPED` (motivo `template_not_approved`), não uma mensagem que não chega — a trava existe em `dunning/evaluate.ts` e tem produtor.
- ⚠️ O envio por template em si **não está implementado**: nada preenche `templateRef` no despacho, então `META_CLOUD` recusa todo envio. Ver §Estado atual antes de tratar esse canal como entregável.

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
| Rotas da UI | inglês, plural quando o recurso é contável | `/customers`, `/charges`, `/leads`, `/dunning`, `/settings` |

`/conta` é a única rota ainda em pt-BR — resíduo do rename, não é o padrão a copiar.

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
- Motor da régua, travas, os adapters de WhatsApp → `docs/projeto/tecnico/06-regua-e-canais.md`
- Etapas, critérios de pronto, riscos → `docs/projeto/tecnico/07-plano-de-entrega.md`
- Site: Astro, arquitetura de conteúdo, SEO técnico, conversão, CWV → `docs/projeto/tecnico/08-site.md`
- Escopo contratado e o que é R$ 150/h → `docs/projeto/comercial/02-precificacao.md`
- Telas, densidade, estados, escrita da UI → `docs/projeto/design/02-handoff-painel.md` (régua em `03-handoff-regua.md`, marca em `00-marca.md`)
- Dois bancos locais, SQL manual das migrations, enum sem adapter → [`prisma/README.md`](prisma/README.md)
- Stack local do canal não oficial (Docker, Caddy, variáveis) → `infra/evolution/README.md`

⚠️ Dois resíduos conhecidos nesses docs: `docs/projeto/README.md` ainda abre com "implementação não iniciada" e chama de "3 adapters" o que hoje são dois, e `docs/projeto/design/02-handoff-painel.md` ainda descreve o canal Salvy. Ignorar esses pontos; o resto dos docs vale.

Marcadores nos docs: ⚠️ = requisito de segurança, não cortável. 🔮 = fora do escopo, **não implementar sem pedido explícito**.

---

## Prioridade de esforço

**Financeiro > régua > importação > resto.**

Nenhum cliente abandona o sistema por causa da ORM ou do framework. O que decide é o saldo bater, a régua não mandar cobrança duplicada, e a margem estar certa.
