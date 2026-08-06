# 04 — Frontend (React Server Components)

## Server por padrão, client por necessidade

`'use client'` só quando o componente precisa de: estado, efeito, evento do usuário, ou API do browser.

- ❌ `'use client'` no topo de `page.tsx` para "facilitar". Empurra a árvore inteira para o cliente e arrasta o bundle junto.
- ✅ Página é Server Component; a ilha interativa (diálogo, formulário, filtro) é o client component.
- Componente cliente **não busca dados**. Recebe por prop, ou chama uma Server Action.
- ❌ `useEffect` + `fetch` para carregar dado que o servidor já podia ter renderizado.

## Organização por feature

```
src/features/charges/
  components/    ChargeTable.tsx, RegisterPaymentDialog.tsx
  actions.ts     Server Actions
  queries.ts     leitura
  service.ts     escrita
  schema.ts      Zod
```

- ❌ **Uma feature não importa de outra feature.** Promove para `components/ui/` (sem domínio) ou para um módulo compartilhado — ver [05-reuso](./05-reuso.md).
- Arquivo de rota é composição. Passou de 100 linhas, tem conteúdo no lugar errado.
- Deletar uma feature deve ser apagar uma pasta.

## Estado

| Tipo de estado | Onde |
|---|---|
| Dados do servidor | Server Component + `revalidatePath`. **Única** fonte |
| Estado de UI local (diálogo aberto, aba) | `useState` no componente |
| Filtro de lista, paginação, busca | `searchParams` da URL |
| Sessão | cookie, lido no servidor |

- ❌ **Copiar dado do servidor para `useState`.** Nasce desatualizado na primeira revalidação. Deriva direto da prop.
- ❌ Estado global para o que é de uma tela só.
- Filtro na URL, não em memória: o operador compartilha link e volta pelo histórico.
- `useOptimistic` para ações rápidas (marcar como pago), com reversão em caso de erro.

## Formulários

- `react-hook-form` + **o mesmo schema Zod da Server Action** como resolver. Validação duplicada à mão é divergência garantida.
- Erro do servidor mapeado para o campo quando o `code` permite; o resto vira erro de formulário.
- Botão de submit desabilita durante a mutation. Duplo clique em "Registrar pagamento" não pode gerar dois pagamentos — o service é a defesa real, o `disabled` é conveniência.
- Campo de dinheiro usa componente de moeda que trabalha em centavos. ❌ `parseFloat` no valor digitado.

## Dinheiro, data e texto

- ❌ **Formatar dinheiro à mão ou converter centavos para `number`.** Usar `formatCents` de `lib/format.ts`; `BigInt` chega como string.
- Data exibida no **fuso do negócio**, nunca no do navegador. Vencimento é conceito local — usar o helper, não `toLocaleDateString()` cru.
- Toda string visível em pt-BR. Sem mistura de idioma na UI.
- Telefone exibido formatado (`(11) 99999-8888`), armazenado em E.164.

## Credencial na tela

⚠️ Senha de acesso do assinante aparece mascarada (`••••••••`). Revelar é uma Server Action dedicada que **audita antes de devolver**. O valor não fica em estado de cliente além do necessário — some ao fechar o diálogo.

⚠️ Nenhuma credencial de canal volta para a tela, nem mascarada. Mostrar "configurado em DD/MM" e um botão de substituir.

## Estados de tela

Toda lista trata os três: **carregando, erro e vazio**.

- `loading.tsx` por rota, com skeleton — não spinner de tela cheia.
- `error.tsx` por rota, com ação de tentar de novo.
- Empty state aponta para a ação. "Nenhum registro encontrado" não é empty state; "Você ainda não cadastrou nenhum cliente — [Cadastrar o primeiro]" é.

## Acessibilidade e UX (mínimo não negociável)

- Input com `label` associado; ícone-botão com `aria-label`.
- Foco visível; navegação por teclado funcional em diálogo e tabela.
- **Ação destrutiva exige confirmação explícita** — cancelar cobrança, desconectar canal, anonimizar cliente.
- **Ação em massa acima de 100 mensagens exige confirmação por digitação do número.** É trava de produto, não detalhe de UX.
- Kill switch da régua fica visível no dashboard, não escondido em configurações.

## Performance

- Code splitting é o padrão do App Router. Não importar tela pesada no layout.
- Tabela grande: paginação por cursor do servidor. Virtualização só quando medida.
- ❌ `useMemo` / `useCallback` por antecipação. Só com medição.
