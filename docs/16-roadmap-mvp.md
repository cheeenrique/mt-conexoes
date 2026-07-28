# 16 — Roadmap e MVP

## Filosofia de corte

O escopo original tinha ~18 meses de trabalho solo. Este recorte tem ~3–4 meses até o primeiro cliente pagante.

**O que ficou de fora e por quê** está em `01-visao-produto.md#não-objetivos` e nos ADRs. O maior corte foi o motor visual de workflow (ADR-012): a régua parametrizável entrega ~90% do valor com ~10% do custo, e o barramento de eventos fica pronto para o engine futuro.

---

## Fase 0 — Fundação (2–3 semanas)

Sem isso, nada mais funciona corretamente.

- [ ] Monorepo pnpm + Turborepo, com `contracts`, `core`, `db`, `ui`, `config`
- [ ] NestJS com dois entrypoints (`main.ts`, `worker.ts`)
- [ ] Postgres + Prisma 7 (driver adapter) + primeira migration
- [ ] ⚠️ RLS configurado + role sem `BYPASSRLS` + **teste de isolamento entre tenants**
- [ ] Graphile Worker + helper `enqueue(tx, ...)` transacional
- [ ] Outbox + dispatcher
- [ ] Auth completo: cadastro, login, refresh com rotação, recuperação de senha
- [ ] `TenantGuard` + `RbacGuard` globais + decorators de permissão
- [ ] Interceptor de auditoria + `Idempotency-Key`
- [ ] Vite + TanStack Router/Query + shell do painel + `packages/ui` com tokens
- [ ] Sentry, logs estruturados, `/health`
- [ ] CI: typecheck, lint, teste, migration check
- [ ] Deploy de staging funcionando ponta a ponta

**Critério de pronto:** dois tenants, dois usuários, e um teste automatizado provando que A não enxerga nada de B.

---

## Fase 1 — Núcleo do domínio (3–4 semanas)

- [ ] `packages/core`: cálculo de vencimento, multa, juros, proração, alocação — **com testes unitários**
- [ ] CRUD de Customer + Contact + Tag
- [ ] CRUD de Plan
- [ ] Subscription com máquina de estados completa (doc 06)
- [ ] `AccessPeriod` + constraint `EXCLUDE` (pré-pago)
- [ ] Charge + Payment + Allocation
- [ ] ⚠️ Ledger de partidas dobradas + job `ledger:verify`
- [ ] Registro manual de pagamento
- [ ] `Supplier`, `costCents`, contas `COGS`/`AP`, desconto recorrente (doc 17)
- [ ] Jobs: `charge:generate`, `charge:mark-overdue`, `charge:apply-late-fees`
- [ ] Telas: lista e ficha de cliente, assinaturas, cobranças, registrar pagamento

**Critério de pronto:** criar cliente, assinatura pré e pós-paga, gerar cobrança, registrar pagamento parcial e total, e o ledger bate em todos os casos.

---

## Fase 2 — Comunicação e régua (3–4 semanas)

- [ ] Integration + Connection Manager + criptografia envelope
- [ ] Canal e-mail (Resend) ativo por padrão
- [ ] Provider WhatsApp: Meta Cloud API
- [ ] Provider WhatsApp: Salvy
- [ ] Provider WhatsApp: Evolution + ⚠️ avisos permanentes e aceite de risco
- [ ] Modelo de capabilities aplicado no editor de templates
- [ ] Templates com variáveis + preview com dados reais
- [ ] Régua: modelo, avaliação diária, agendamento, execução
- [ ] Réguas e templates padrão (pré e pós-pago)
- [ ] ⚠️ Travas T1–T8 (doc 09) — **todas**
- [ ] Timeline de mensagens na ficha do cliente
- [ ] Tela de saúde da integração + mensagem de teste
- [ ] Campos personalizados, incluindo tipo `SECRET` com permissão e auditoria (doc 17)

**Critério de pronto:** cobrança vence, mensagem sai sozinha no horário certo, pagamento cancela os passos seguintes, e o kill switch funciona.

---

## Fase 3 — Recebimento e importação (3–4 semanas)

- [ ] Pix manual com BR Code estático
- [ ] Provider Mercado Pago + webhook + conciliação automática
- [ ] Provider PagBank + webhook
- [ ] Wizards passo a passo de cada provider
- [ ] ⚠️ Pipeline de importação completo — 9 fases (doc 13)
- [ ] Detecção de aba, cabeçalho, tipo, separador, encoding
- [ ] Mapeamento de colunas e de **valores**
- [ ] Dry-run, preview, execução em lotes, relatório, desfazer
- [ ] Salvar mapeamento como template
- [ ] Vínculo de fornecedor por lote de importação (doc 17)

**Critério de pronto:** importar uma planilha real e bagunçada de um usuário beta, do upload à régua em modo revisão, sem intervenção manual no banco.

---

## Fase 4 — Onboarding e dashboards (2–3 semanas)

- [ ] Onboarding com progresso derivado (doc 12)
- [ ] Empty states apontando para os passos
- [ ] Autoteste de configuração
- [ ] Dashboard: MRR, inadimplência, receita em risco, próximos vencimentos, conversão de trial
- [ ] Relatórios em TypedSQL: aging, DSO, taxa de recuperação, fluxo de caixa
- [ ] Dashboard de lucro, margem por fornecedor, painel de LTV na ficha, alertas de margem (doc 17)
- [ ] Exportação CSV (com escape anti-injection)
- [ ] Convite de usuários + gestão de papéis
- [ ] Billing do SaaS: planos, `PlanLimitGuard`, integração com gateway próprio

**Critério de pronto:** um usuário novo, sem ajuda, completa os 6 passos e envia a primeira cobrança automática.

---

## 🚀 Lançamento

**Critérios de saída para cobrar do primeiro cliente:**

- [ ] Teste de isolamento entre tenants passando no CI
- [ ] `ledger:verify` sem divergência por 30 dias em staging
- [ ] Restore de backup testado
- [ ] Travas T1–T8 verificadas manualmente
- [ ] 3 usuários beta operando por 2 semanas sem intervenção no banco
- [ ] Termos de Uso, AUP, Política de Privacidade e DPA publicados
- [ ] Runbook: gateway bloqueado · número banido · webhook falhando · restore

---

## Pós-MVP

### Fase 5 — Portal do assinante (3–4 semanas)
Login por OTP, 2ª via, Pix, comprovantes, histórico. Subdomínio por tenant (ADR-007). Maior redutor de suporte do produto.

### Fase 6 — Aprofundamento
Caixa de entrada unificada · relatórios PDF · MFA · domínio próprio (Cloudflare for SaaS) · API pública + OpenAPI publicado · segundo vertical validado.

### Fase 7 — Motor de automação 🔮
Somente com ~30 tenants pagantes reclamando de rigidez da régua. Ver doc 09, seção final, para o que já estará pronto e o que faltará.

---

## Riscos de execução

| Risco | Sinal de alerta | Resposta |
|---|---|---|
| Escopo voltando a crescer | "só falta adicionar…" | Reler os não-objetivos; novo item vai para pós-MVP por padrão |
| Fase 2 estourando | > 5 semanas | Cortar Evolution ou Salvy do MVP; manter apenas um provider oficial |
| Importação subestimada | Planilha real quebrando o parser | É a feature mais importante — dar o tempo que precisar, cortar dashboard antes |
| Perfeccionismo de UI | Refazendo telas antes de ter usuário | Congelar visual após `packages/ui`; iterar só com feedback real |
| Domínio financeiro mal modelado | "depois eu arrumo o ledger" | ⚠️ Não avançar para a Fase 2 com Fase 1 incompleta |

---

## Nota final

As decisões de stack estão fechadas e documentadas nos ADRs. Elas importam menos do que parece: **nenhum cliente vai escolher ou abandonar este produto por causa da ORM, do framework de front ou da camada de transporte.**

O que decide o resultado é: a conciliação funcionar, a régua não mandar cobrança duplicada, e o saldo bater. Todo o esforço deve ir para lá.
