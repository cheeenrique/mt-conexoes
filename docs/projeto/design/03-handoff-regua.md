# 03 — Handoff de design · Régua de cobrança

> Cole isto no Claude Design **junto com** [`02-handoff-painel.md`](./02-handoff-painel.md) — aquele tem os tokens visuais (cor, tipografia, forma) que valem aqui também. Este documento só existe porque a régua tem estado, transição e trava demais pra caber como uma subseção do handoff geral, e é a área do sistema mais fácil de desenhar errado.
> Fonte técnica: [`../tecnico/06-regua-e-canais.md`](../tecnico/06-regua-e-canais.md) e [`../tecnico/02-modelo-de-dados.md`](../tecnico/02-modelo-de-dados.md). Se uma dúvida não estiver respondida aqui, a resposta está nesses dois — não inventar.

## Por que essa tela é diferente de um CRUD comum

Régua não é uma lista com formulário de editar. É uma **máquina de estado com efeito real e irreversível** — ativar errado manda cobrança pra quem já pagou e queima o número de WhatsApp do cliente. Toda decisão de UI aqui existe pra tornar o estado atual óbvio e pra tornar impossível ativar sem ver o que vai sair.

Três entidades, uma dentro da outra:

```
DunningRule (a régua)
  └── DunningStep[] (os passos, um por deslocamento de dia)
        └── DunningExecution[] (o que rodou, por cobrança — histórico, não se edita)
```

---

## As quatro telas

```
Lista de réguas ──> Editor de régua ──> Editor de passo (dialog)
                          │
                          └──> Tela de revisão (ao mudar de RASCUNHO/EM REVISÃO pra ATIVA)
```

### Tela 1 — Lista de réguas

Rota `/regua`. Tabela: nome · estado (badge) · "padrão" (marcador binário) · nº de passos ativos.

- Pode existir mais de uma régua cadastrada, mas **só uma tem `isDefault = true`** — é ela, e só ela, que o motor de avaliação diária usa.
- Ação principal da tela: **Nova régua**. Abre o editor (tela 2) com uma régua vazia em `RASCUNHO`.
- Ação por linha, só quando a régua não é a padrão: **Tornar padrão**. Confirmação nomeada: *"Definir '[nome]' como régua padrão? A régua ativa hoje é '[nome atual]' — a partir de amanhã 07:00 é essa que vai rodar."* Não é "tem certeza?" genérico — troca de padrão muda o que sai amanhã de manhã.
- Régua excluída: só permitido se `status = RASCUNHO` e nunca foi ativada (sem `DunningExecution` associada a nenhum dos seus passos). Régua que já rodou não se apaga — no máximo pausa.

### Tela 2 — Editor de uma régua

Rota `/regua/[id]`. Header com nome (editável inline) e badge de estado grande, no topo — é a primeira coisa que o operador vê ao entrar.

```
┌──────────────────────────────────────────────────────────┐
│  Régua padrão                          [ EM REVISÃO ]    │
│  ⚠ 12 mensagens sairiam hoje se ativada                  │
│  [ Ver lista e ativar ]                                   │
├──────────────────────────────────────────────────────────┤
│  D-5 ──── D-2 ──── D0 ──── D+1 ──── D+3 ──── D+5          │
│   ✉        ✉        ✉        ✉        ✉        ⏸        │
│                                          [+ Adicionar]     │
└──────────────────────────────────────────────────────────┘
```

- O eixo é a navegação principal: cada ícone é um passo cadastrado, clicável, abre o editor de passo (tela 3) preenchido.
- Espaço vazio no eixo entre dois passos existentes, ou nas pontas, é onde **Adicionar passo** aparece ao passar o mouse/tocar — não é um botão fixo distante do eixo.
- Ícone por ação: `✉` mandar mensagem, `⏸` suspender, `🔔` avisar o dono (usar os mesmos ícones em toda a tela, inclusive na timeline do cliente).
- Passo desativado (`isActive = false`) aparece esmaecido no eixo, não desaparece.
- Régua nova (sem nenhum passo) mostra o eixo vazio com um único CTA central: **"Começar com a régua padrão sugerida"** (pré-carrega D-5/D-2/D0/D+1/D+3/D+5 da tabela abaixo) **ou** "Montar do zero".

#### Passos da régua padrão entregue (referência pra pré-carregar)

| Deslocamento | Ação | Texto |
|---|---|---|
| D-5 | Enviar mensagem | lembrete de renovação próxima |
| D-2 | Enviar mensagem | lembrete com chave Pix |
| D0 | Enviar mensagem | vence hoje |
| D+1 | Enviar mensagem | aviso de atraso |
| D+3 | Enviar mensagem | último aviso |
| D+5 | Suspender assinatura | — muda status e avisa o dono, não envia mensagem própria |

### Tela 3 — Editor de um passo (dialog, sobre a tela 2)

Abre ao clicar "Adicionar passo" ou num ícone existente no eixo.

| Campo | Tipo | Comportamento |
|---|---|---|
| Deslocamento | número + toggle "antes / depois do vencimento" | Vira `offsetDays` negativo (antes) ou positivo (depois), nunca zero-antes-de-vencer ambíguo — dia do vencimento em si é sempre "depois, 0". Não pode repetir um deslocamento já usado nessa régua (`@@unique([ruleId, offsetDays])`) — o formulário bloqueia no `onBlur`, mensagem: *"Já existe um passo em D-5. Edite o existente ou escolha outro dia."* |
| Ação | select: **Enviar mensagem** / **Suspender assinatura** / **Avisar o dono** | Muda quais campos abaixo aparecem — ver tabela de visibilidade condicional logo adiante. |
| Texto da mensagem | textarea, só visível se ação = Enviar mensagem | Chips de variável clicáveis acima do textarea (inserem `{{...}}` no cursor) — nunca pedir pro operador digitar a sintaxe de memória. Lista completa de variáveis na seção seguinte. |
| Template aprovado (Meta) | dois campos extras — nome do template + mapeamento de parâmetros — só visíveis se ação = Enviar mensagem **e** o canal padrão ativo agora é Meta Cloud | Sem preencher isso, esse passo com esse canal ativo não sai como mensagem — vira `SKIPPED` no motor. O dialog mostra um aviso inline, não deixa descobrir isso só depois de ativar. |
| Passo ativo | toggle, padrão ligado | Desligar não apaga o passo nem o texto — só faz o motor pular ele. |

**Validação ao salvar**: toda variável usada no texto precisa existir na lista conhecida (próxima seção). Variável desconhecida ou digitada errada (`{{cliente.primerio_nome}}`) **bloqueia o salvar**, com a linha do erro apontada — nunca falha silenciosamente na hora de enviar. `{{assinatura.senha}}` e qualquer variável de credencial **não aparecem na lista de chips e são recusadas** se digitadas — não é uma opção que existe e foi esquecida, é proibida por design.

**Excluir passo**: se o passo nunca rodou (nenhuma `DunningExecution`), remove direto. Se já rodou pra alguma cobrança, pede confirmação nomeando o impacto: *"Este passo já disparou 8 vezes. Removê-lo não afeta o que já foi enviado, só impede novas execuções."*

#### Variáveis disponíveis no texto

| Variável | Vira |
|---|---|
| `{{cliente.primeiro_nome}}` | João |
| `{{cliente.nome}}` | João Silva |
| `{{cobranca.valor}}` | R$ 60,00 |
| `{{cobranca.vencimento}}` | 10/08 |
| `{{cobranca.dias_atraso}}` | 3 |
| `{{pix.chave}}` | a chave configurada em Ajustes |
| `{{negocio.nome}}` | o nome do negócio configurado em Ajustes |

Nenhuma outra variável existe. Em especial: nenhuma variável de credencial de acesso do assinante.

### Tela 4 — Revisão e ativação

Só existe como caminho a partir do estado `EM REVISÃO`. Não é uma tela separada na navegação — é o que abre ao clicar **"Ver lista e ativar"** no header da tela 2.

```
┌──────────────────────────────────────────────────────────┐
│  12 mensagens sairiam hoje se a régua fosse ativada agora │
├──────────────────────────────────────────────────────────┤
│  Cliente         Passo        Texto real                  │
│  João Silva      D-2          "Olá João! Sua renovação..."│
│  Maria Souza     D+1          "Olá Maria! Sua renovação..."│
│  ...                                                        │
├──────────────────────────────────────────────────────────┤
│  [ Enviar todas ]  [ Ignorar retroativos e ativar ]  [ Manter em revisão ] │
└──────────────────────────────────────────────────────────┘
```

⚠️ **A lista é sempre a lista real, com o texto real de cada mensagem já renderizado com os dados do cliente** — nunca um número sozinho ("12 mensagens"), nunca placeholder (`{{cliente.primeiro_nome}}` cru). Ativar sem ver quem recebe o quê é o erro mais caro do sistema — é como mandar cobrança pra quem já pagou.

Três botões, três resultados diferentes — nomear exatamente isso, não "Confirmar" genérico:

| Botão | O que faz | Quando usar |
|---|---|---|
| **Enviar todas** | Cria `DunningExecution` + `Message` pra tudo que está na lista, régua vira `ATIVA` | Base nova, sem histórico duvidoso |
| **Ignorar retroativos e ativar** | Marca as cobranças já vencidas antes de hoje como `OVERDUE` **sem agendar passo nenhum** pra elas, régua vira `ATIVA`, só passos futuros disparam dali pra frente | **Pré-selecionado.** É a opção certa na entrega — base importada quase sempre tem histórico incerto, e disparar cobrança retroativa pra quem já pagou queima a relação no primeiro dia |
| **Manter em revisão** | Não muda nada, fecha a tela | Operador quer ajustar mais um passo antes de decidir |

Acima de 100 mensagens na lista, "Enviar todas" exige digitar o número pra confirmar (mesma trava de ação em massa do resto do sistema).

---

## Estados da régua — diagrama e quem aciona cada transição

```
RASCUNHO ──(Enviar para revisão)──> EM REVISÃO ──(Enviar todas /
                                          │           Ignorar retroativos e ativar)──> ATIVA
                                          └──(Manter em revisão)──> EM REVISÃO (sem mudança)

ATIVA ──(Pausar régua, botão na tela 2)──> PAUSADA
PAUSADA ──(Retomar)──> ATIVA
```

| Estado | Cor da badge | O motor faz | Ação disponível na tela |
|---|---|---|---|
| `RASCUNHO` | cinza | Nada. Não avalia, não conta mensagem. | Editar passos livremente. Botão "Enviar para revisão". |
| `EM REVISÃO` | `--warn` | Calcula tudo (`DunningExecution` com `outcome = PENDING_REVIEW`), **não cria nenhuma `Message`**. | "Ver lista e ativar" (tela 4). Ainda dá pra editar passo. |
| `ATIVA` | `--ok`, discreta — não é o estado que precisa gritar | Avalia e despacha normalmente, todo dia. | Editar passo continua liberado (edição não desativa a régua). Botão "Pausar régua". |
| `PAUSADA` | `--flame` | Motor de despacho não envia nada novo (kill switch separado do da régua — ver nota abaixo). Avaliação continua rodando e enfileirando, mas nada sai. | Botão "Retomar". |

⚠️ **Régua nasce em `RASCUNHO` por padrão do sistema, mas a régua que a MT Conexões recebe pronta é entregue em `EM REVISÃO`** — a base importada tem histórico incerto, e o operador precisa decidir na frente da lista real antes de qualquer coisa sair. Não pular esse estado no fluxo de onboarding da tela.

⚠️ **"Pausar régua" (por régua) é diferente do kill switch global (`Settings.sendingPaused`, botão fixo na sidebar).** Kill switch para **todo** envio do sistema, de qualquer origem, na hora. Pausar uma régua específica só afeta os passos dessa régua. Se existir só uma régua, o efeito prático é parecido, mas a tela não pode tratar os dois como o mesmo botão — são dois controles com dois donos de estado diferentes (`DunningRule.status` vs `Settings.sendingPaused`).

---

## Envio manual assistido — parente da régua, tela separada

Fica em **Mensagens**, não em Régua — mas usa o mesmo motor de template e as mesmas travas (exceto a dedupe diária, que aqui é escolha consciente do operador, não bloqueio automático).

Fluxo: filtrar clientes (em atraso / vencem hoje / por fornecedor / por plano) → prévia com o **texto real** de cada um (mesma regra da tela de revisão — nunca placeholder) → disparar em lote, cria `Message` com `kind = MANUAL` → acima de 100, confirmação por digitação do número.

Não tem estado próprio (`RASCUNHO`/`ATIVA`/etc) — é ação pontual, não uma régua configurável.

---

## O que a tela precisa recusar, não só validar

Casos que já foram identificados como fonte de erro de desenho — a tela bloqueia **antes** de deixar o operador tentar, não deixa o servidor recusar depois:

1. **Ativar régua sem nenhum passo ativo.** Botão de ativação (tela 4) fica desabilitado com o motivo: *"Nenhum passo ativo — a régua não faria nada."*
2. **Dois passos com o mesmo deslocamento.** Bloqueado no editor de passo (tela 3), não no salvar da régua inteira.
3. **Passo "Enviar mensagem" com canal ativo Meta Cloud e sem template aprovado preenchido.** Aviso no próprio dialog do passo (tela 3), reforçado como alerta persistente no editor da régua (tela 2) se o canal padrão mudar pra Meta depois que o passo já existia sem template.
4. **Variável de template desconhecida ou de credencial.** Bloqueia salvar o passo (tela 3), nunca deixa chegar a enviar vazio ou a expor senha.
5. **Editar/excluir uma `Message` ou `DunningExecution` já disparada.** Não existe — histórico é só leitura, aparece na timeline (ver `02-handoff-painel.md`, seção Mensagens), nunca com botão de editar.
6. **Trocar régua padrão sem aviso do que muda amanhã.** Confirmação nomeada, não "tem certeza?" (ver tela 1).

---

## Travas — o que aparece na tela quando cada uma age

Redundante com `02-handoff-painel.md` de propósito — aqui é o detalhe de cada uma, lá é o resumo.

| Trava | O que a tela mostra quando ela age |
|---|---|
| **T5 — opt-out** | Cliente com opt-out não aparece na lista de destinatários da tela de revisão. Na timeline do cliente, execução pulada mostra `⊘ Pulado` com motivo "cliente pediu para sair". |
| **T6 — quiet hours** | Mensagem fora de 08h–20h não aparece como "enviada" na timeline até a próxima janela — status `PENDING`, sem alarme, ela vai sair. |
| **T7 — uma por dia** | Cliente com 3 cobranças vencidas no mesmo dia aparece **uma vez** na lista da tela de revisão, com o total consolidado — nunca 3 linhas pro mesmo cliente no mesmo dia. |
| **T8 — kill switch** | Faixa fina `--flame` no topo de toda tela do sistema (não só régua) enquanto pausado — ver `02-handoff-painel.md`, seção Kill switch. Mensagem parada mais de 24h reaparece na timeline como `✕` cancelada, motivo "atrasada". |

---

## Checklist de revisão antes de entregar a tela pro operador

- [ ] Nenhum botão de ativação fica habilitado sem mostrar a lista real primeiro
- [ ] Estado da régua (badge) é a primeira coisa visível ao abrir qualquer tela de régua
- [ ] Texto de cada botão de ativação diz exatamente o que ele faz, sem "Confirmar" genérico
- [ ] Editor de passo nunca deixa salvar variável desconhecida ou de credencial
- [ ] Nenhuma tela permite editar histórico já executado
- [ ] Kill switch global e "pausar régua" são visualmente e funcionalmente distintos
- [ ] Ação acima de 100 mensagens (ativação ou envio manual) exige digitar o número
