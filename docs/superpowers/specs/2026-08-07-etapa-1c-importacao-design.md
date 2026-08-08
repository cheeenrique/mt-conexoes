# Etapa 1c — Importação da base atual

> Terceiro e último sub-projeto da Etapa 1. Ordem: 1a Base (feito) → 1b Cliente (feito) →
> **1c Importação (este doc)**. Baseado no resumo de um vídeo que o cliente mandou mostrando
> como ele controla a base hoje — não temos o arquivo real ainda, ele chega depois. O mapeamento
> de coluna fica documentado e ajustável quando o arquivo real for anexado.

## Como o cliente controla a base hoje (fonte: resumo do vídeo)

Uma planilha Excel por sistema/fornecedor (Tubarão, Club TV, UniPlay, etc.), cada uma com uma
lista de clientes daquele fornecedor. Colunas por linha: código/nome do cliente, usuário e senha
de acesso, data de criação, validade/vencimento, contagem regressiva (derivada, não importa),
telas, custo, valor do serviço, desconto, contato (WhatsApp). Ele acompanha a coluna de
vencimento diariamente e avisa o cliente ~2 dias antes por WhatsApp.

## Divergência de modelo — vencimento na importação

`CLAUDE.md`/`03-datas-e-ciclos.md`: vencimento é sempre calculado a partir do **pagamento**
(`nextDueDate(paidAt, cycle, tz)`), nunca um campo direto. A planilha real do cliente não tem
"data do último pagamento" — só a **data de vencimento atual**, que ele já controla na mão.

**Decisão do product owner:** na importação, usa a data de vencimento da planilha **direto**
como `Subscription.nextDueAt` — sem tentar inferir um `paidAt` que não existe na origem, sem
chutar. Isso é um bootstrap único: a partir do primeiro pagamento registrado no sistema novo
(Etapa 2), a regra normal (pagamento → próximo vencimento calculado) passa a valer. A linha só é
recusada se a data de vencimento da planilha for vazia ou não for uma data real — nunca por
"não ter paidAt", porque essa coluna nunca existiu na origem.

## Escopo

Script `scripts/import-customers.ts`, rodado manualmente pelo desenvolvedor/operador uma vez por
arquivo (um arquivo = um fornecedor). Roda fora do fluxo normal do app — mesmo padrão de
`prisma/seed.ts` (Prisma direto, sem Server Action, sem sessão HTTP), porque a regra de
vencimento aqui é deliberadamente diferente da regra normal do sistema (`firstDueDate` não
entra aqui).

## 1. Uso

```bash
pnpm import:customers <arquivo.xlsx> "<Nome do Fornecedor>"
```

- Faz upsert do `Supplier` pelo nome (cria se não existir — fluxo normal já tem `unitCostCents`
  padrão 0, o operador ajusta depois na tela de Fornecedores se quiser).
- Toda linha do arquivo vira uma `Subscription` desse fornecedor.
- `Customer` é upsertado por telefone: mesmo cliente presente em duas planilhas diferentes
  (ex.: assina Tubarão e Club TV) vira **um** `Customer` com **duas** `Subscription`.

## 2. Mapeamento de coluna (documentado, ajustável)

Config no topo do script, fácil de editar quando o arquivo real chegar — nomes de coluna
assumidos com base no resumo do vídeo, em português, variação de maiúscula/espaço tolerada na
comparação:

| Coluna da planilha (assumida) | Campo | Observação |
|---|---|---|
| Código / Nome do Cliente | `Customer.name` | |
| Contato (WhatsApp) | `Customer.phone` | normalizado pra E.164, `+55` implícito se DDD+número sem código de país |
| Usuário | `Subscription.accessUsername` | claro |
| Senha | `Subscription.accessPasswordEnc` | criptografada com `lib/crypto.ts#encrypt`, purpose `subscription.accessPassword` |
| Data de Criação | `Subscription.startedAt` | |
| Validade / Data de Vencimento | `Subscription.nextDueAt` | **direto, sem cálculo** — ver decisão acima |
| Telas | `Subscription.screens` | default 1 se ausente |
| Custo | `Subscription.costCents` | reais → centavos, round half up |
| Valor do Serviço | `Subscription.priceCents` | reais → centavos, round half up |
| Desconto | `Subscription.discountType`/`discountValue` | se presente e não-zero; formato ambíguo (% ou R$) — heurística: valor com `%` ou menor que 1 vira `PERCENT`, senão `FIXED` (documentado como suposição a confirmar contra o arquivo real) |
| Contagem regressiva | *(ignorada)* | derivada, o sistema recalcula sozinho |

Ciclo: **sempre `MONTHLY`** — planilha não tem coluna de ciclo, IPTV revendido é majoritariamente
mensal. Operador ajusta manualmente os raros casos trimestral/anual depois, na tela de
assinatura (já existe, 1b).

## 3. Validação e recusa

Recusa (não tenta adivinhar), linha entra no relatório com motivo:

- Telefone ausente ou impossível de normalizar pra E.164.
- Nome vazio.
- Data de vencimento ausente ou não é uma data real.
- Valor (`priceCents`) não-numérico ou negativo.

## 4. Idempotência

Rodar o script duas vezes com o mesmo arquivo não duplica. Antes de criar uma `Subscription`,
verifica se já existe uma para aquele `Customer` + `Supplier` com o mesmo `accessUsername` (se
presente) — se sim, pula a linha e registra como "já importada" no relatório, não cria de novo.

## 5. Relatório

Ao final, imprime no console **e** grava um arquivo (`import-report-<timestamp>.txt`, mesma
pasta do script ou `./tmp/`):

- Total de linhas lidas.
- Quantas importadas com sucesso.
- Quantas puladas por já existir (idempotência).
- Quantas recusadas, cada uma com o motivo e o identificador da linha (nome ou número da linha
  na planilha).
- Soma de `priceCents` importado — pro operador conferir contra o total que ele já sabe de cor
  da planilha.

## Fora do escopo

Pipeline de 9 fases do spec original (descartado, `CLAUDE.md` já documenta isso). UI de
importação — é script de linha de comando, não tela. Qualquer coisa que dependa de `Charge`/
`Payment` (não existem ainda). Tratamento de mais de 4h de dados sujos — contrato já prevê isso
como R$ 150/hora à parte, script para e mostra o relatório de recusa se passar disso (decisão
humana, não automatizada).

## Critério de pronto

- Script roda contra um arquivo `.xlsx` de teste (estrutura fake seguindo o mapeamento acima,
  já que o arquivo real ainda não chegou) e importa corretamente.
- Telefone duplicado entre duas rodadas (dois fornecedores, mesmo cliente) consolida em um
  `Customer` só.
- Linha com dado inválido é recusada com motivo claro, nunca importada com valor chutado.
- Rodar o mesmo arquivo duas vezes não duplica assinatura.
- Relatório final bate: total = importadas + puladas + recusadas.
- Senha de acesso importada aparece mascarada na ficha do cliente (1b) e revela corretamente
  via `revealCredentialAction`.
- `pnpm typecheck && pnpm lint && pnpm build && pnpm test` verdes.
