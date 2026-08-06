# 05 — Reuso e componentização

Aperta a regra global de DRY para este projeto.

## Quando extrair

| Ocorrências | Ação |
|---|---|
| 1 | Deixa inline. Extrair agora é DRY prematuro. |
| 2 | Observa. Duplicar é aceitável. |
| 3 | Extrai. |

Exceção que antecipa a extração: **regra financeira ou de segurança**. Cálculo de vencimento, arredondamento, resolução de custo, transição de estado e checagem de opt-out nascem em `core/` na primeira ocorrência — a duplicata aqui não é feia, é um bug futuro de divergência de valor.

⚠️ Duplicação **acidental** não é duplicação. Dois trechos parecidos hoje que mudam por razões diferentes ficam separados. Unificá-los cria um helper com `if` de contexto seis meses depois.

## Caminho de promoção

```
dentro do componente / service
        ↓  (2º consumidor real na mesma feature)
utils/ ou hook da própria feature
        ↓  (2ª feature precisa, ainda com domínio)
features/shared/  ou  lib/
        ↓  (sem domínio nenhum)
core/  ou  components/ui/
```

Nunca pular etapa. Componente que nasce em `components/ui/` sem dois consumidores reais vira API genérica demais para um caso só.

## O que entra em `components/ui/`

✅ `Button`, `Dialog`, `DataTable`, `Toast`, `EmptyState`, `CurrencyInput`, `ConfirmDialog`, tokens de design.

❌ `ChargeTable`, `CustomerForm`, `DunningStepEditor` — conhecem o domínio, moram na feature.

**Teste:** se o componente precisa importar um enum do Prisma, ele não é de `ui`.

Regras adicionais:

- Componente de `ui` não busca dados, não conhece rota, não conhece sessão. Recebe tudo por prop.
- Variação por **prop declarativa** (`variant="danger"`), nunca por `if` de contexto de chamada.
- Estilo por tokens do preset Tailwind. Valor mágico (`#3b82f6`, `mt-[13px]`) não passa em review.

## O que entra em `core/`

✅ Função pura de domínio: dinheiro, data, ciclo, transição de estado, avaliação de condição da régua.

❌ Qualquer coisa que toque Prisma, Next, `process.env`, `node:crypto` ou o relógio do sistema.

**Data e hora entram por parâmetro.** `new Date()` dentro de `core/` torna o teste dependente do dia em que roda — e o bug de fim de mês aparece justamente no dia 31.

## O que entra em `lib/`

Infra sem domínio: cliente Prisma, sessão, criptografia, formatação, logger. Não contém regra de negócio.

`formatCents` mora aqui e não em `core/` porque é apresentação. `divRoundHalfUp` mora em `core/` porque é cálculo.

## Reuso entre UI e cron

O job **chama o service**, não reimplementa. Se um job precisa de uma variação da regra, o parâmetro entra no service — não nasce uma segunda versão da regra no handler.

⚠️ Duplicar cálculo financeiro entre a tela e o job é o erro mais caro possível aqui: a UI mostra um valor e o WhatsApp manda outro.

## Abstração de canal

WhatsApp é plugável por `capabilities`. Provider novo é uma implementação da interface + registro — **zero edição** fora de `features/messaging/channels`.

❌ `if (provider === 'evolution')` fora do adapter. Se apareceu, o modelo de capabilities está incompleto: corrige o modelo, não adiciona o `if`.

## Sinais de que a abstração está errada

- Helper com flag booleana que muda o comportamento pela metade → eram duas funções.
- Componente com 12 props opcionais → era composição, não configuração.
- Camada de indireção com um único consumidor → inline de volta.
- "Vamos deixar configurável" sem requisito atual → hardcode.
- Função em `core/` que recebe um objeto do Prisma inteiro → recebe os campos que usa.
