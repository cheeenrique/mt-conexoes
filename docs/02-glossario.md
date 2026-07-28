# 02 — Glossário de Domínio

> Linguagem ubíqua. Estes nomes valem em código, banco, API e conversa. Se um conceito aparecer com outro nome em qualquer lugar, é bug de nomenclatura.

## Entidades centrais

**Tenant** — a organização cliente do SaaS. Pode ser **pessoa física** (revendedor autônomo) ou **pessoa jurídica**. Unidade de isolamento de dados. Não existe hierarquia entre tenants.

**User** — pessoa que acessa o painel. Um `User` pode pertencer a vários tenants através de **Memberships**.

**Membership** — vínculo entre `User` e `Tenant`, portador do **Role**. É onde vive a permissão, nunca no `User`.

**Customer** — o assinante final; o cliente do nosso cliente. Nunca chamar de "usuário".

**Contact** — forma de contatar um `Customer` (telefone, e-mail). Um customer tem N contatos, um deles marcado como primário por canal.

**Plan** — pacote comercial do tenant ("Premium", "HD", "Anual"). Carrega **preço sugerido** e periodicidade. Não é o plano do nosso SaaS.

**Subscription** — vínculo entre `Customer` e `Plan`, com **preço próprio** e **vencimento próprio**. É a entidade central da operação.

**AccessPeriod** — janela de acesso concedida no modelo **pré-pago** (`startsAt`, `endsAt`). Períodos da mesma assinatura nunca se sobrepõem.

**Supplier** — fornecedor do serviço revendido. Organiza a base, define custo padrão e é a principal quebra de relatório de margem.

**Campo personalizado** — campo definido pelo tenant em `Customer` ou `Subscription`. Tipo `SECRET` é criptografado, mascarado e auditado.

## Financeiro

**Charge** — cobrança. Documento que representa "este customer deve este valor até esta data". Imutável após emitida; correções são feitas por documentos novos (crédito, ajuste), nunca por edição.

**Payment** — pagamento recebido. Entidade independente da `Charge`.

**Allocation** — alocação de um `Payment` a uma ou mais `Charges`. Permite pagamento parcial, pagamento a maior e um pagamento cobrindo várias cobranças.

**LedgerEntry** — lançamento contábil. Toda movimentação financeira gera lançamentos balanceados. **Saldo é sempre derivado, nunca armazenado.**

**Credit** — saldo a favor do customer (pagamento a maior, abono, estorno interno). Abate cobranças futuras automaticamente.

**Abono** — perdão total ou parcial de uma cobrança por decisão do tenant. Gera lançamento de `DISCOUNT`, não apaga a cobrança.

**COGS** — custo da mercadoria vendida. Custo do crédito/linha reconhecido na emissão da cobrança e congelado nela.

**Lucro bruto** — receita − custo − descontos − perdas. Rotulado como "bruto" até existir módulo de despesas fixas.

**Margem em risco** — custo já reconhecido de cobranças ainda não recebidas.

**Write-off** — baixa por incobrabilidade. Encerra a cobrança sem pagamento, reconhecendo a perda.

**Multa** — penalidade fixa percentual aplicada uma vez após o vencimento.

**Juros** — encargo proporcional aos dias de atraso (*pro rata die*).

**DSO** — prazo médio de recebimento. Métrica-chave de eficácia da régua.

**MRR** — receita recorrente mensal, normalizada por periodicidade.

## Cobrança e comunicação

**Régua** (`DunningRuleset`) — sequência configurada de passos de cobrança, ancorada no vencimento.

**Passo da régua** (`DunningStep`) — um ponto da régua: deslocamento em dias (`D-3`, `D0`, `D+7`), canal, template e condições.

**Template** — mensagem com variáveis dinâmicas (`{{customer.name}}`, `{{charge.amount}}`, `{{pix.code}}`).

**Channel** — meio de envio: `whatsapp` ou `email`.

**Provider** — implementação concreta de um channel ou de pagamento (Meta, Salvy, Evolution, Mercado Pago, PagBank, Pix manual).

**Capabilities** — declaração do que um provider suporta. O sistema consulta capabilities; **nunca** faz `if (provider === 'x')`.

**Janela de serviço** — período de 24h após mensagem recebida do customer, no qual o WhatsApp permite texto livre gratuito.

**Modo de revisão** — estado da régua em que ela calcula os envios mas não dispara, aguardando confirmação humana. ⚠️ Obrigatório após importação.

## Operação

**ImportBatch** — uma execução de importação de planilha, com mapeamento, validação e possibilidade de desfazer.

**Onboarding step** — passo de configuração inicial. Conclusão é **sempre derivada do estado real**, nunca de flag manual.

**Integration** — conexão configurada entre um tenant e um provider externo, com credenciais criptografadas e status de saúde.

**Outbox** — tabela de eventos gravada na mesma transação da mudança de estado, garantindo que nenhum efeito colateral se perca.

## Convenções de nomenclatura

| Contexto | Convenção | Exemplo |
|---|---|---|
| Eventos | `entidade.acao` no passado | `charge.paid`, `subscription.suspended` |
| Jobs | `dominio:acao` | `dunning:evaluate`, `message:send` |
| Permissões | `recurso:acao` | `charges:write`, `customers:read` |
| Tabelas | `snake_case` plural | `ledger_entries` |
| Modelos Prisma | `PascalCase` singular | `LedgerEntry` |
| Rotas | plural, kebab | `/customers/:id/subscriptions` |
| Dinheiro | sempre `...Cents`, tipo `BigInt` | `amountCents` |
| Datas | sempre `...At`, UTC | `dueAt`, `paidAt` |
