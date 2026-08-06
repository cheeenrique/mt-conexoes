# 07 — Definition of Done

Checklist antes de abrir PR. Não é burocracia — cada item aqui já é causa conhecida de incidente neste domínio.

## Sempre

- [ ] `typecheck`, `lint` e testes passando localmente (evidência, não suposição)
- [ ] Nada de `any` em borda de entrada; nada de `@ts-ignore` sem comentário justificando
- [ ] Sem `console.log`, sem código comentado, sem TODO órfão (TODO tem dono e contexto)
- [ ] Arquivos dentro do orçamento de tamanho de [01-arquitetura](./01-arquitetura.md)
- [ ] Commit em Conventional Commits, corpo explicando **por quê**

## Se tocou Server Action ou service

- [ ] Action começa com `requireSession()` — Server Action é endpoint público
- [ ] Entrada validada com Zod; nenhum `z.any()` / `.passthrough()`
- [ ] Nenhum modelo Prisma devolvido direto para a tela — DTO explícito
- [ ] `BigInt` convertido para string antes de cruzar para componente cliente
- [ ] Regra de negócio no service, cálculo em `core/`, action só orquestra
- [ ] Erro com `code` de domínio e `message` em pt-BR para o usuário final
- [ ] `revalidatePath` depois da transação, nunca dentro

## Se tocou o banco

- [ ] Migration nova (nunca editada); destrutiva só via expand/contract
- [ ] Índice parcial, `CHECK` e singleton escritos como SQL manual na migration
- [ ] Dinheiro em `BigInt` cents; nenhuma coluna de saldo
- [ ] Constraint de unicidade existe no **banco**, não só como `if` no código
- [ ] `EXPLAIN` conferido em query de lista ou relatório; sem N+1
- [ ] Índice cobrindo o filtro real da query

## Se tocou dinheiro

- [ ] Nenhum `float`, nem em variável temporária
- [ ] Arredondamento *round half up*, uma vez, no fim
- [ ] `Charge.costCents` congelado na emissão não foi recalculado
- [ ] Cobrança com pagamento registrado não foi editada nem cancelada
- [ ] Teste com `0`, `1` centavo e valor com dízima

## Se tocou data

- [ ] Âncora de fim de mês preservada — nunca sobrescrita com o dia efetivo
- [ ] Vencimento gravado como `23:59:59` local convertido para UTC
- [ ] Corte de relatório saindo de `monthBoundsUtc`, não de `date_trunc` em UTC
- [ ] `new Date()` não entrou em `core/`; `now` veio por parâmetro
- [ ] Teste cobrindo 31/01 → fevereiro e ano bissexto

## Se tocou envio de mensagem

- [ ] Opt-out respeitado na avaliação **e** no despacho (T5)
- [ ] Quiet hours respeitadas no fuso do negócio; fora da janela reagenda, não descarta (T6)
- [ ] Deduplicação diária garantida por índice único, não por `if` (T7)
- [ ] Kill switch continua funcionando, e mensagem `stale` continua sendo cancelada (T8)
- [ ] Pagamento e cancelamento reconferidos antes de enviar
- [ ] Nenhum conteúdo de mensagem em log técnico

## Se tocou canal ou credencial

- [ ] Credencial criptografada; nunca volta para o front, nem mascarada
- [ ] Nada de credencial em log, Sentry ou mensagem de erro; erro do provider sanitizado
- [ ] Comportamento decidido por `capabilities`, sem `if (provider === ...)` fora do adapter
- [ ] Passo sem template aprovado em canal que exige template → `SKIPPED`, nunca envio
- [ ] Revelar senha de acesso grava `CredentialReveal` **antes** de devolver o valor

## Se tocou rota de cron

- [ ] Token OIDC validado; sem token, 401
- [ ] Handler idempotente, garantido por constraint
- [ ] `now` recebido por parâmetro
- [ ] Falha por item capturada e logada sem derrubar a passada
- [ ] Processa em lote se puder passar do timeout

## Se tocou o frontend

- [ ] `'use client'` só onde há estado, evento ou API do browser
- [ ] Loading, erro e vazio tratados; empty state aponta para a ação
- [ ] Schema Zod da action reusado no formulário
- [ ] Dinheiro formatado pelo helper; data exibida no fuso do negócio
- [ ] Filtro e paginação em `searchParams`, não em `useState`
- [ ] Ação destrutiva com confirmação; ação em massa > 100 com confirmação por digitação
- [ ] Feature não importa de outra feature

## Se mudou uma decisão de arquitetura

- [ ] Doc afetado em `docs/projeto/tecnico/` atualizado no mesmo PR
- [ ] `CLAUDE.md` atualizado se uma regra dura mudou
