# 06 — Testes

Runner: Vitest. Integração contra Postgres real em container.

## Onde TDD é obrigatório

Teste escrito **antes** do código, vermelho antes de verde:

| Área | Por quê |
|---|---|
| `src/core/**` | Vencimento, âncora de fim de mês, ciclo, desconto, arredondamento, margem. Bug aqui não gera ticket, gera cliente conferindo na mão e perdendo a confiança. |
| Travas T5–T8 da régua | É o que separa sistema útil de número de WhatsApp banido. |
| Idempotência de cada job | Rodar duas vezes tem que dar o mesmo resultado. |
| Criptografia de credencial | Ida e volta, e falha **explícita** com chave errada. |
| Cálculo de data com fuso e fim de mês | Fonte histórica de bug nº 1. |

Fora dessas áreas: teste junto ou depois, sem dogma. CRUD, tela e formatação não precisam de red-green cerimonial.

## Suites que bloqueiam a entrega

- **Datas e ciclos** — a lista completa de `docs/projeto/tecnico/03-datas-e-ciclos.md`
- **Dinheiro** — a lista de `docs/projeto/tecnico/04-dinheiro-e-margem.md`, incluindo a soma dos lucros por cliente fechando com o painel geral
- **Travas e idempotência da régua** — a lista de `docs/projeto/tecnico/06-regua-e-canais.md`

## Como testar

- Um comportamento por teste. Nome descreve o comportamento, não o método: `âncora 31 vira 28 em fevereiro e volta a 31 em março`, não `test nextDueDate 3`.
- Testar **comportamento observável**, não implementação. ❌ Espiar quantas vezes o Prisma foi chamado. ✅ Verificar o estado resultante.
- Arrange-Act-Assert explícito. Sem asserção escondida no setup.
- Teste financeiro usa valores que já quebraram sistema: `0`, `1` centavo, R$ 33,33 dividido em três, 31/01 → fevereiro, ano bissexto, virada de mês em UTC.

## Relógio

**Injetado por parâmetro, nunca mockado globalmente.**

```ts
// ✅
expect(nextDueDate({ currentDue: d('2026-01-31'), anchor: 31, cycle: 'MONTHLY', timezone: TZ }))
  .toEqual(d('2026-02-28'));

// ❌ vi.setSystemTime(...) para testar cálculo puro
```

Job recebe `now` por parâmetro e desce até `core/`. É o que torna o cron testável sem manipular o relógio do processo.

## Banco nos testes

- Integração roda contra **Postgres real** (container), nunca SQLite. **Índice parcial e `CHECK` não existem em SQLite** — testar sem eles é testar outro sistema, e são justamente eles que garantem a dedupe diária e a unicidade da cobrança.
- Cada teste limpa o que criou ou roda em transação com rollback. Teste que depende da ordem de execução é teste quebrado.
- Teste de constraint tenta a inserção duplicada de verdade e espera o erro do banco. Não confere só o `if` do código.

## Mocks

- **Não mockar o que você não possui.** Meta, Evolution e Salvy são abstraídos por adapter; o teste usa um fake do **nosso** adapter.
- Não mockar `core/` — é puro e rápido, usa de verdade.
- Mock demais é sintoma de acoplamento: se testar exige montar cinco mocks, o desenho está errado.

## O que não testar

Getter trivial, tipo do TypeScript, biblioteca de terceiro, markup estático. Cobertura como meta numérica não é objetivo — cobertura das áreas da primeira tabela é.
