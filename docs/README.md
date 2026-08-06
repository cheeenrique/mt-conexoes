# Documentação

Tudo vive em [`projeto/`](./projeto/) — comece por [`projeto/README.md`](./projeto/README.md).

| Pasta | Conteúdo |
|---|---|
| [`projeto/comercial/`](./projeto/comercial/) | Apresentação para o cliente e termos comerciais |
| [`projeto/tecnico/`](./projeto/tecnico/) | Arquitetura, modelo de dados, datas, dinheiro, segurança, régua, plano de entrega |

## Histórico

Este repositório começou como especificação de um SaaS multi-tenant de cobrança recorrente — 18 documentos cobrindo multi-tenancy, RLS, RBAC, ledger de partidas dobradas, NestJS e monorepo. Foi descartado em favor do projeto atual: **single-tenant, Next.js, entrega fechada para um cliente**.

A especificação antiga continua recuperável no commit `3fc471e`:

```bash
git show 3fc471e:docs/05-modelo-de-dados.md
git show 3fc471e --stat
```

⚠️ Ela descreve uma arquitetura que **não é** a deste projeto. Consultar só como referência de domínio (alocação de pagamento, armadilhas de importação de planilha, conciliação), nunca como guia de implementação.
