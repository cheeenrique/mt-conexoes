# 00 — Índice das regras do projeto

Estas regras **sobrescrevem** as globais (`~/.claude/rules/*.md`). Onde forem silenciosas, valem as globais.

Coberto globalmente e **não repetido aqui**: SOLID, DRY/KISS/YAGNI, Conventional Commits, SemVer, 12-factor, composition over inheritance, errors as data. Aqui fica só o que é específico deste projeto ou aperta o limite global.

| # | Arquivo | Assunto |
|---|---|---|
| 01 | [arquitetura.md](./01-arquitetura.md) | Camadas, direção de dependência, orçamento de tamanho |
| 02 | [servidor.md](./02-servidor.md) | Server Components, Server Actions, services, transações, cron, erros |
| 03 | [dados.md](./03-dados.md) | Prisma, migrations, índices, performance de query |
| 04 | [frontend.md](./04-frontend.md) | RSC vs client, features, estado, formulários, acessibilidade |
| 05 | [reuso.md](./05-reuso.md) | Quando extrair, para onde promover, o que nunca compartilhar |
| 06 | [testes.md](./06-testes.md) | Onde TDD é obrigatório, o que testar, o que não mockar |
| 07 | [definition-of-done.md](./07-definition-of-done.md) | Checklist antes de abrir PR |

## Pré-flight

Antes de escrever código, ler nesta ordem:

1. `CLAUDE.md` na raiz — regras duras do domínio (dinheiro, data, travas da régua, credencial)
2. Estas regras
3. O doc de `docs/projeto/tecnico/` que cobre a área tocada
4. `~/.claude/rules/*.md` — universais

## Precedência

`docs/projeto/` descreve **o que** o sistema faz. `.claude/rules/` descreve **como** escrever o código. Doc de domínio contradiz regra de estilo daqui: o doc ganha, e a regra daqui é corrigida — não ignorada em silêncio.

⚠️ O repositório teve uma especificação multi-tenant anterior (NestJS, monorepo, ts-rest, RLS, ledger de partidas dobradas), descartada e recuperável em `git show 3fc471e`. **Nada daquilo existe aqui.** Se algum trecho de código ou doc parecer assumir tenants, camadas de use case ou contratos ts-rest, é resíduo — corrigir.
