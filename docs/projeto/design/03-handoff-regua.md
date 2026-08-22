# 03 — Handoff de design · Régua de cobrança

> Cole isto no Claude Design **junto com** [`02-handoff-painel.md`](./02-handoff-painel.md) — aquele tem os tokens visuais (cor, tipografia, forma) que valem aqui também.
>
> ⛔ **RETRATO DATADO — NÃO É O ESTADO ATUAL.** Este documento foi verificado no código em
> **11/08/2026** e descrevia fielmente a tela daquele dia. A tela foi **reconstruída em
> 22/08/2026** e quase toda afirmação abaixo virou falsa. Fica aqui como registro de como a
> régua era antes da reconstrução; para o que existe hoje, ler o código
> (`src/features/dunning/`) ou `CLAUDE.md` §Estado atual — não este arquivo.

## O que mudou depois de 11/08 (o que abaixo não vale mais)

| Este documento diz | Hoje |
|---|---|
| Rota `/regua` | **`/dunning`** |
| Uma única régua, sem lista, sem "criar régua nova", sem "trocar qual é a padrão" | **Várias réguas**, tela mestre-detalhe: lista à esquerda (seleção em `searchParams`), botão "Nova régua", botão "Tornar padrão" com confirmação |
| `PAUSED` não tem ação nenhuma que leve até lá | Existem **"Pausar régua"** e **"Retomar régua"** no cabeçalho |
| Botões de ativação: "Ignorar retroativos e ativar" e **"Enviar todas"** | "Manter em revisão", **"Ativar sem descartar a revisão"** e "Ignorar retroativos e ativar". O rótulo mudou justamente porque "Enviar todas" não envia nada |
| Faixa de revisão = contagem agregada por passo | Diálogo com o **texto real** de cada mensagem que sairia hoje, consolidado por cliente pelo mesmo `consolidate` do motor |
| Passos em **lista vertical de cards**, sem eixo | **Eixo horizontal** do vencimento (`StepAxis`), um passo por coluna |
| Deslocamento = um `number` com sinal (`-5` ou `5`) | **Dias** (positivo) + **"Em relação ao vencimento"** (antes/depois). O campo com sinal saiu porque digitar `5` em vez de `-5` cobrava a base inteira no dia errado, sem erro nenhum |
| `metaTemplateName` **não existe** no schema | Existe, com campo próprio no drawer do passo. Passo sem ele, em canal que exige template, vira `SKIPPED` com motivo `template_not_approved` |
| Nome da régua não é editável na tela | Editável no cabeçalho, campo não controlado, salva no blur |

O resto — tabela de estados, ações do select, lista de variáveis do template, regra de que
"Suspender assinatura" não corta acesso técnico — foi conferido em 11/08 e não foi
reverificado. Tratar como indício, não como fonte.

---

## O que existia em 11/08/2026

Uma única régua (`DunningRule`), sempre a mesma — não há tela de lista, não há "criar régua nova", não há "trocar qual é a padrão". `getDefaultRuleWithSteps()` busca a única régua marcada `isDefault` e é isso que a página `/regua` renderiza. O schema tem campo `isDefault` e suportaria mais de uma régua em tese, mas **não existe nenhuma ação no código pra criar uma segunda ou trocar qual está ativa** — a capacidade "múltiplas réguas por situação" não foi construída.

## A tela `/regua` — como era em 11/08/2026

Página única, top-to-bottom, sem sub-rotas:

```
┌──────────────────────────────────────────────────────────┐
│  Régua de cobrança                                        │
│  Régua padrão   [ Em revisão ]                            │
├──────────────────────────────────────────────────────────┤
│  ⚠ Régua em revisão — 12 execução(ões) pendente(s)        │
│  D-5 (Enviar mensagem): 5                                 │
│  D+1 (Enviar mensagem): 4                                 │
│  D+5 (Suspender assinatura): 3                             │
│  [ Ignorar retroativos e ativar ]  [ Enviar todas ]        │
├──────────────────────────────────────────────────────────┤
│                                       [ + Novo passo ]     │
│  ┌────────────────────────────────────────────────────┐  │
│  │ D-5 — Enviar mensagem            [Ativo] [✎] [🗑]  │  │
│  │ Olá {{cliente.primeiro_nome}}! Sua renovação...     │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ D+5 — Suspender assinatura       [Ativo] [✎] [🗑]  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

- Header: nome da régua + badge de estado. **Não** é um eixo/linha do tempo — é texto simples ao lado do nome.
- Faixa de revisão aparece **só quando `status = REVIEW`**, some sozinha assim que a régua vira `ACTIVE`.
- Lista de passos é uma **lista vertical de cards**, um por passo, sem representação gráfica de "antes/depois do vencimento" nem eixo horizontal. Cada card mostra: `D{sinal}{offsetDays} — {ação}`, uma linha do texto (truncada), badge Ativo/Inativo, botões editar e remover.
- Sem seção de "estado da régua" separada do header — é o mesmo badge.

### Estados e badge

| `status` | Rótulo mostrado | Tom do badge |
|---|---|---|
| `DRAFT` | Rascunho | neutro/aviso |
| `REVIEW` | Em revisão | aviso |
| `ACTIVE` | Ativa | sucesso |
| `PAUSED` | Pausada | aviso |

⚠️ **`PAUSED` existe no banco mas não tem ação nenhuma que leve até lá.** Não existe botão "pausar régua" em lugar nenhum da tela. O único controle de pausa real do sistema é o **kill switch global** (`Settings.sendingPaused`, botão fixo na sidebar — ver `02-handoff-painel.md`). Se pedir uma ação de "pausar esta régua" pro Claude Design, está pedindo uma feature nova, não descrevendo a tela atual.

### Ativação (faixa de revisão)

Só aparece com `status = REVIEW`. Mostra, por passo, quantas execuções pendentes existem (`D{offset} ({ação}): {contagem}`) — é uma lista agregada por passo, **não** uma lista nominal de clientes com texto renderizado por pessoa.

Dois botões, cada um abre um `ConfirmDialog` com o texto exato:

| Botão | Texto de confirmação |
|---|---|
| **Ignorar retroativos e ativar** | "As execuções pendentes de revisão serão descartadas e a régua passa a valer só pra frente." |
| **Enviar todas** | "A régua fica ativa. As execuções pendentes de revisão continuam registradas, sem reprocessamento automático." |

⚠️ Note a diferença do que a spec técnica original descrevia: "Enviar todas" aqui **não** dispara as mensagens pendentes retroativamente — só ativa a régua e deixa as execuções pendentes registradas sem reprocessar. Nenhum dos dois caminhos manda mensagem pro passado. Se o texto da tela sugerir "enviar todas" = disparo retroativo de fato, está descrevendo algo que o botão não faz.

### Passo — dialog de criar/editar

Um dialog (`StepDrawer`), quatro campos, nessa ordem:

| Campo | Tipo real | Nota |
|---|---|---|
| Deslocamento | `input type="number"`, com rótulo "Deslocamento (dias, negativo = antes do vencimento)" | Um campo numérico com sinal — **não** é um par toggle+número. Operador digita `-5` ou `5` direto. |
| Ação | `select` com as 3 opções abaixo | — |
| Texto | `textarea`, rótulo "Texto (com variáveis {{...}})" | Textarea simples. **Não tem chips clicáveis de variável** — operador digita a sintaxe `{{...}}` de próprio punho. |
| Passo ativo | checkbox | — |

Ações do select, rótulo exato:

| Valor | Rótulo |
|---|---|
| `SEND_MESSAGE` | Enviar mensagem |
| `SUSPEND` | Suspender assinatura |
| `NOTIFY_OWNER` | Notificar operador |

Sempre que há texto no campo, uma **prévia ao vivo** aparece abaixo (`TemplatePreview`), renderizada com dados de uma cobrança real recente — isso bateu com o handoff original e continua valendo.

⚠️ Passo com ação "Suspender assinatura" **não corta o acesso técnico** (streaming continua funcionando) — só muda `Subscription.status` pra `SUSPENDED`. Confirmado no motor (`evaluate.ts`).

### Validação

- Variável desconhecida no texto (`{{cliente.primerio_nome}}`) → erro aparece **no campo de texto**, via `setError('templateBody', ...)`, disparado pela resposta da Server Action — não é bloqueio client-side antes de tentar salvar.
- Dois passos com o mesmo deslocamento → erro só aparece **depois de tentar salvar** (`DuplicateStepOffsetError`, vira toast) — não há checagem prévia no formulário nem lista de deslocamentos já usados visível no dialog.
- Excluir passo sempre pede confirmação nomeada ("Tem certeza que quer remover o passo D{offset}? Essa ação não pode ser desfeita.") — não tem distinção entre passo que já rodou e passo que nunca rodou, a confirmação é igual pra qualquer passo.

### Variáveis disponíveis no texto

Confirmado batendo 100% com `src/core/dunning-template.ts`:

| Variável | Vira |
|---|---|
| `{{cliente.primeiro_nome}}` | João |
| `{{cliente.nome}}` | João Silva |
| `{{cobranca.valor}}` | R$ 60,00 (valor **restante**, já descontando pagamento parcial) |
| `{{cobranca.vencimento}}` | 10/08 |
| `{{cobranca.dias_atraso}}` | 3 |
| `{{pix.chave}}` | a chave configurada em Ajustes |
| `{{negocio.nome}}` | o nome do negócio configurado em Ajustes |

Nenhuma outra existe. Em especial, nenhuma variável de credencial de acesso do assinante — o validador (`assertKnownVariables`) recusa qualquer coisa fora dessa lista.

---

## O que este documento descrevia antes e **não existia em 11/08** — não redesenhar em cima disso sem decisão explícita

⚠️ Quatro dos cinco itens abaixo **foram construídos em 22/08/2026**: lista de réguas com "Nova
régua" e "Tornar padrão", `metaTemplateName` no schema e no drawer do passo, pausar/retomar por
régua, e o eixo horizontal. Só "chips de variável clicáveis" continua não existindo. A lista
segue aqui como registro da decisão de escopo daquele momento.

A versão anterior deste handoff (escrita antes de eu ler o código real) inventou as seguintes telas/campos, que **não têm nenhum suporte no backend hoje**:

- **Lista de réguas** com "Nova régua" e "Tornar padrão" — não existe ação de criar régua nem de trocar qual é a padrão. Só existe uma régua, sempre.
- **Campos de template aprovado da Meta** (`metaTemplateName`, `metaTemplateParams`) — o schema de `DunningStep` só tem `templateBody`. O motor de despacho não faz nenhuma checagem de canal exigir template aprovado; ele manda o `body` renderizado direto pro adapter, seja qual for o canal.
- **Botão de pausar/retomar por régua**, distinto do kill switch — não existe.
- **Eixo horizontal D-5…D+5** como elemento visual da tela de régua — a tela real é uma lista vertical de cards, sem esse desenho.
- **Chips de variável clicáveis** no editor de passo — o campo é textarea simples.

Se alguma dessas é algo que você quer de verdade (por exemplo: enviar via Meta Cloud exige template aprovado por regra do WhatsApp, então esse gap é potencialmente um bug de produto, não só um exagero de design) — isso é decisão de escopo. Antes de pedir pro Claude Design desenhar de novo, para e decide: é ajuste visual da tela que existe, ou é feature nova que precisa de brainstorm + schema + service antes de virar tela?
