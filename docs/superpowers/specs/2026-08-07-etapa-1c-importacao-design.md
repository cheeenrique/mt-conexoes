# Etapa 1c — Importação da base atual

> Terceiro e último sub-projeto da Etapa 1. Ordem: 1a Base (feito) → 1b Cliente (feito) →
> **1c Importação (este doc)**. Desenhado primeiro a partir de um resumo de vídeo do cliente;
> **atualizado depois de receber o arquivo real** (`Planilha para cadastro de Clientes UNIPLAY
> 2026.xlsm`) — as seções abaixo já refletem o formato real, não mais a suposição inicial.

## Como o cliente controla a base hoje

Uma planilha Excel por sistema/fornecedor (Tubarão, Club TV, UniPlay, etc.), cada uma com uma
lista de clientes daquele fornecedor. O arquivo real recebido (`.xlsm`, aba `IPTV`) tem estas
colunas, nesta ordem, com espaço em branco real em alguns cabeçalhos (`" VALOR "`, `"  WHATSAPP"`
— o parser precisa dar `trim()` no nome da coluna antes de comparar):

`CODIGO` (apelido/nome curto) · `USUARIO` · `SENHA` (**número**, não texto — `9939894`) ·
`CRIAÇÃO` (data) · `VALIDADE` (data) · `EXPIRA` (texto derivado tipo "24 DIAS PARA VENCER" —
ignorado, o sistema recalcula) · `TELAS` · `VALOR` · `CUSTO` · `DESCONTO` · `WHATSAPP`.

Datas (`CRIAÇÃO`/`VALIDADE`) vêm como **serial numérico do Excel** na leitura crua — o parser
`xlsx` só as converte pra `Date` de verdade se o arquivo for lido com a opção `cellDates: true`
(confirmado testando contra o arquivo real). Sem essa opção, a data chega como número tipo
`46265`, inútil sem conversão manual — usar sempre `readFile(path, { cellDates: true })`.

A planilha também tem, num canto, um pequeno resumo financeiro embutido (RECEBIDO/CUSTO/LUCRO)
que o Excel calcula sozinho — aparece como colunas soltas (`__EMPTY`, `__EMPTY_1`, ...) quando lida
por linha. Não é dado de cliente, é ignorado naturalmente (o parser só lê pelos nomes de coluna
que interessam, nunca itera "todas as colunas").

⚠️ **A coluna WHATSAPP está vazia em 100% das 28 linhas do arquivo real recebido.** Isso muda a
decisão de telefone — ver seção dedicada abaixo.

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

## Divergência de modelo — telefone deixa de ser obrigatório

`Customer.phone` era `String` obrigatório e único desde a 1b (T5/T7 — opt-out e dedupe diária
dependem dele, mas essas travas só entram em Etapa 3/4, quando a régua existir). A planilha real
não tem telefone nenhum preenchido — o cliente controla o contato de outro jeito (provavelmente
direto na agenda do WhatsApp), não nessa planilha.

**Decisão do product owner:** `Customer.phone` vira **opcional** (`String?`), com `@@unique`
continuando a valer só entre valores não-nulos (Postgres trata múltiplos `NULL` como distintos
num índice único — não precisa de índice parcial extra pra isso). Migration expand simples,
compatível com os dados já existentes de 1b.

Efeitos em cascata, todos parte do escopo desta etapa:

- `customerSchema.phone` (1b, `features/customers/schema.ts`) vira opcional.
- `CustomerDrawer` (1b) já usa `PhoneInput` controlado — funciona com string vazia sem mudança
  de componente, só a validação do schema muda.
- `listCustomers`'s busca por telefone (1b, `features/customers/queries.ts`) já usa `contains`,
  que não quebra com `phone: null` — mas o `where.OR` com `{ phone: { contains: q } }` precisa
  tolerar `phone` nulo na comparação (Prisma já lida com isso nativamente, `contains` num campo
  `null` simplesmente não bate — sem crash, confirmar em teste).
- Dedup na importação: quando a linha **tem** telefone, dedup por telefone (mesmo comportamento
  de antes). Quando **não tem**, não dá pra saber se é o "mesmo cliente" de outra planilha — cria
  um `Customer` novo por linha nesse caso, sem tentar adivinhar. Idempotência de re-rodar o
  mesmo arquivo continua garantida por `Customer`+`Supplier`+`accessUsername` (chave que já não
  dependia de telefone).

## Escopo

Script `scripts/import-customers.ts`, rodado manualmente pelo desenvolvedor/operador uma vez por
arquivo (um arquivo = um fornecedor). Roda fora do fluxo normal do app — mesmo padrão de
`prisma/seed.ts` (Prisma direto, sem Server Action, sem sessão HTTP), porque a regra de
vencimento aqui é deliberadamente diferente da regra normal do sistema (`firstDueDate` não
entra aqui).

## 1. Uso

```bash
pnpm import:customers <arquivo.xlsx-ou-xlsm> "<Nome do Fornecedor>"
```

`xlsx` (a biblioteca) lê `.xlsm` igual a `.xlsx` — macro é ignorada, só a planilha importa. Sempre
lê a **primeira aba** do arquivo (o arquivo real tem uma segunda aba `Planilha1` vazia — ignorada).

- Faz upsert do `Supplier` pelo nome (cria se não existir — fluxo normal já tem `unitCostCents`
  padrão 0, o operador ajusta depois na tela de Fornecedores se quiser).
- Toda linha do arquivo vira uma `Subscription` desse fornecedor.
- `Customer` é upsertado por telefone **quando a linha tem telefone válido**. Mesmo cliente
  presente em duas planilhas diferentes com o mesmo telefone (ex.: assina Tubarão e Club TV) vira
  **um** `Customer` com **duas** `Subscription`. Sem telefone, cada linha vira um `Customer` novo
  (ver decisão de telefone opcional acima).

## 2. Mapeamento de coluna (formato real, confirmado contra o arquivo)

Config no topo do script, comparando nome de coluna com `trim()` (cabeçalhos reais têm espaço em
branco, ex. `" VALOR "`):

| Coluna da planilha (real) | Campo | Observação |
|---|---|---|
| `CODIGO` | `Customer.name` | apelido/nome curto, aceito como está |
| `WHATSAPP` | `Customer.phone` | opcional agora — normalizado pra E.164 quando presente, `Customer` fica sem telefone quando ausente (ver decisão acima) |
| `USUARIO` | `Subscription.accessUsername` | claro |
| `SENHA` | `Subscription.accessPasswordEnc` | **chega como número** (`9939894`), converter pra string antes de criptografar com `lib/crypto.ts#encrypt`, purpose `subscription.accessPassword` |
| `CRIAÇÃO` | `Subscription.startedAt` | célula-data, exige `cellDates: true` na leitura |
| `VALIDADE` | `Subscription.nextDueAt` | **direto, sem cálculo** — ver decisão acima; célula-data, mesma exigência de `cellDates: true` |
| `TELAS` | `Subscription.screens` | numérico direto, default 1 se ausente |
| `CUSTO` | `Subscription.costCents` | numérico em reais → centavos, round half up |
| `VALOR` | `Subscription.priceCents` | numérico em reais → centavos, round half up |
| `DESCONTO` | *(não importado)* | ver nota abaixo |
| `EXPIRA` | *(ignorada)* | derivada, o sistema recalcula sozinho |
| `__EMPTY*` (resumo financeiro embutido) | *(ignorada)* | não é dado de cliente |

Ciclo: **sempre `MONTHLY`** — planilha não tem coluna de ciclo, IPTV revendido é majoritariamente
mensal. Operador ajusta manualmente os raros casos trimestral/anual depois, na tela de
assinatura (já existe, 1b).

Desconto (`DESCONTO`): coluna existe mas só apareceu `0` nas linhas do arquivo recebido, sem
indicação clara de formato (% ou R$) pros casos não-zero — **continua fora do escopo desta
etapa**, mesma decisão do design original. Operador adiciona manualmente se algum cliente tiver.

## 3. Validação e recusa

Recusa (não tenta adivinhar), linha entra no relatório com motivo:

- Nome vazio.
- Data de vencimento ausente ou não é uma data real.
- Valor (`priceCents`) não-numérico ou negativo.

Telefone **não é mais motivo de recusa** — ver decisão acima. Ausente vira `Customer.phone: null`,
presente e impossível de normalizar (ex.: sem DDD) ainda vira `null` com uma nota no relatório
("telefone informado mas inválido — cliente importado sem telefone"), não uma recusa da linha
inteira: o resto do dado (nome, credencial, vencimento) é bom o bastante pra valer a pena
importar mesmo sem telefone confiável.

## 4. Idempotência

Rodar o script duas vezes com o mesmo arquivo não duplica. **A checagem acontece antes de tocar
em `Customer`**, não depois: telefone nulo não serve de chave de upsert (`WHERE phone IS NULL`
bateria em qualquer cliente sem telefone, não no cliente certo). Ordem real:

1. Se a linha tem `accessUsername`, procura uma `Subscription` já existente com esse
   `accessUsername` **e** o `Supplier` desta rodada. Se achar, pula a linha inteira (não cria
   `Customer` nem `Subscription` de novo) e registra "já importada" no relatório.
2. Sem achar (ou sem `accessUsername` na linha — aí não dá pra checar idempotência, cada rodada
   cria de novo, aceitável porque replanilhar a mesma base duas vezes sem usuário de acesso não é
   um caso real esperado): resolve o `Customer` — upsert por telefone se a linha tem telefone
   válido, senão cria um `Customer` novo — e só então cria a `Subscription`.

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

- Script roda contra um arquivo `.xlsx` de teste (estrutura fake seguindo o mapeamento real
  confirmado) e importa corretamente.
- Script roda contra o **arquivo real** (`Planilha para cadastro de Clientes UNIPLAY 2026.xlsm`)
  sem crashar, produz relatório coerente (28 linhas lidas, a maioria importada — nenhuma recusada
  só por falta de telefone).
- Telefone duplicado entre duas rodadas (dois fornecedores, mesmo cliente) consolida em um
  `Customer` só. Linha sem telefone cria um `Customer` novo, sem tentar adivinhar.
- Linha com dado inválido (nome vazio, vencimento ausente/impossível, valor negativo) é recusada
  com motivo claro, nunca importada com valor chutado.
- Rodar o mesmo arquivo duas vezes não duplica assinatura (checagem por `accessUsername`+
  fornecedor, antes de tocar em `Customer`).
- Relatório final bate: total = importadas + puladas + recusadas.
- Senha de acesso importada (mesmo vindo como número na planilha) aparece mascarada na ficha do
  cliente (1b) e revela corretamente via `revealCredentialAction`.
- Migration de `Customer.phone` opcional aplicada; tela de Clientes (1b) continua funcionando
  pra clientes com e sem telefone (busca, listagem, ficha).
- `pnpm typecheck && pnpm lint && pnpm build && pnpm test` verdes.
