# Projeto — Sistema de Gestão de Assinaturas

> Single-tenant. Um cliente, um deploy, entrega fechada.
> **Status:** especificação fechada, implementação não iniciada.

## O produto em uma frase

Sistema web que substitui a planilha de controle de assinantes — guarda a base com as credenciais de acesso, gera as cobranças de cada ciclo, cobra sozinho no WhatsApp e mostra o lucro por cliente — **mais um site de captação** que traz assinante novo por busca orgânica.

São **duas aplicações separadas**, com domínios e hospedagens distintos. A única ligação é uma chamada HTTP de captura de lead, que degrada sem quebrar nada.

## Termos comerciais

| | |
|---|---|
| Valor | R$ 5.000,00 — 50% na assinatura, 50% na entrega |
| Prazo | 10 semanas, em 5 etapas |
| Código-fonte | Entregue ao cliente |
| Hospedagem | Conta do cliente |
| Garantia | 3 meses sobre o escopo contratado |
| Fora do escopo | R$ 150,00/hora, orçado e aprovado antes |

## Índice

### Comercial

| # | Documento | Conteúdo |
|---|---|---|
| 01 | [Apresentação comercial](./comercial/01-apresentacao-comercial.md) | Deck de 8 slides para o cliente |
| 02 | [Termos comerciais](./comercial/02-precificacao.md) | Valor, escopo contratado, riscos do modelo. **Interno** |

### Design

| # | Documento | Conteúdo |
|---|---|---|
| 00 | [Marca](./design/00-marca.md) | Logo, paleta, tipografia, forma, movimento. Fonte da verdade |
| 01 | [Handoff do site](./design/01-handoff-site.md) | Direção visual, estrutura de página, conversão, escrita |
| 02 | [Handoff do painel](./design/02-handoff-painel.md) | Telas, densidade, estados, interação, escrita |
| 03 | [Handoff da régua](./design/03-handoff-regua.md) | Estados, transições, editor de passo, travas — detalhe que não cabe no handoff geral |

### Técnico

| # | Documento | Conteúdo |
|---|---|---|
| 01 | [Arquitetura](./tecnico/01-arquitetura.md) | Stack, estrutura de pastas, direção de dependência, cron, auth |
| 02 | [Modelo de dados](./tecnico/02-modelo-de-dados.md) | Schema Prisma completo + SQL manual das migrations |
| 03 | [Datas e ciclos](./tecnico/03-datas-e-ciclos.md) | Vencimento, âncora de fim de mês, ciclos, fuso |
| 04 | [Dinheiro e margem](./tecnico/04-dinheiro-e-margem.md) | `BigInt` em centavos, arredondamento, lucro, queries |
| 05 | [Credenciais e segurança](./tecnico/05-credenciais-e-seguranca.md) | Criptografia, auth, logs, LGPD, backup |
| 06 | [Régua e canais](./tecnico/06-regua-e-canais.md) | Motor de cobrança, travas, os 3 adapters de WhatsApp |
| 07 | [Plano de entrega](./tecnico/07-plano-de-entrega.md) | Etapas, critérios de pronto, testes, riscos |
| 08 | [Site de captação](./tecnico/08-site.md) | Astro, arquitetura de conteúdo, SEO técnico, conversão, Core Web Vitals |

## Decisões travadas

| Camada | Escolha | Por quê |
|---|---|---|
| App | Next.js App Router | Um deployable. Server Components para ler, Server Actions para escrever |
| Banco | PostgreSQL — Neon free | Cobre 1.000 assinantes sem custo |
| ORM | Prisma | `BigInt` nativo, migrations maduras |
| Hospedagem | Cloud Run `southamerica-east1` | Free tier cobre o volume inteiro |
| Agendamento | Cloud Scheduler → Route Handler com OIDC | 3 jobs grátis, substitui fila |
| Recebimento | Pix manual, baixa manual | Conciliação automática fica para fase futura |
| WhatsApp | 2 adapters — Meta Cloud e Evolution | Selecionáveis; capabilities decidem o comportamento, e o descritor decide como conectar (QR ou credencial colada) |
| Multi-tenancy | ❌ Não existe | Um cliente |
| Ledger de partidas dobradas | ❌ Não existe | Receita e custo saem de `SUM` sobre `charges` e `payments` |
| Site de captação | Astro + Cloudflare Pages | ~0 KB de JS por padrão. Numa página que é texto, ganha de Next por margem clara |
| Domínio do site | Separado do painel, conta separada | SEO no nicho é adversarial. Domínio penalizado não pode derrubar o painel |

## Regras duras

Violá-las é bug, não preferência.

**Dinheiro**
- `BigInt` em centavos, sufixo `Cents`. Nunca `float`, nem em variável temporária
- Arredondamento *round half up*, uma vez, no fim
- `Charge.costCents` congelado na emissão, nunca recalculado
- Nenhuma coluna de saldo — total é sempre `SUM`
- Cobrança com pagamento registrado não é cancelada nem editada

**Data**
- Banco em UTC, conceito em local. Vencimento é `23:59:59` no fuso do negócio
- Âncora de fim de mês nunca é sobrescrita: 31 vira 28 em fevereiro e volta a 31
- `new Date()` não existe dentro de `core/`

**Régua** — T5 opt-out global · T6 quiet hours 08–20 · T7 uma mensagem por cliente por dia · T8 kill switch imediato. Entregue em modo `REVIEW`.

**Credencial** — senha de acesso criptografada, mascarada, revelação auditada, fora de log, export e mensagem.

**Provider** — comportamento decidido por `capabilities`. `if (provider === ...)` fora do adapter não passa em review.

**Idempotência** — geração de cobrança por `UNIQUE(subscriptionId, periodStart)` · passo da régua por `UNIQUE(chargeId, stepId)` · dedupe diária por índice parcial em `messages`.

## Prioridade de esforço

Financeiro > régua > importação > resto.

Nenhum cliente abandona o sistema por causa da ORM ou do framework. O que decide é o saldo bater, a régua não mandar cobrança duplicada, e a margem estar certa.
