# 02 — Handoff de design · Painel MT Conexões

> Cole isto no Claude Design. Documento autocontido.
> Spec técnica completa em [`../tecnico/`](../tecnico/) · marca completa em [`00-marca.md`](./00-marca.md).
> Este handoff cobre visual **e** regra de negócio. Toda tela nova ou variação de estado que não estiver aqui, conferir a spec técnica antes de inventar — não adivinhar.

## O que é

Ferramenta interna de **MT Conexões**. Substitui a planilha que o dono usa hoje para controlar assinantes, cobrança e lucro.

**Um usuário. Uso diário, várias vezes ao dia, muitas vezes no celular.** Não é produto para vender — é ferramenta de trabalho. O sucesso é ele abrir e já saber o que fazer, sem procurar.

Stack: Next.js App Router, Tailwind, shadcn/ui. ⚠️ O tema padrão do shadcn precisa ser **reconfigurado** com os tokens abaixo — usar cru entrega o dashboard genérico de sempre.

---

## Direção visual

Mesma marca do site, temperatura diferente. O site precisa convencer; o painel precisa **não atrapalhar**. Densidade alta, ruído baixo, cor com parcimônia.

### Cor

```css
--ink:        #0B0B0C;   /* fundo da aplicação */
--ink-2:      #141417;   /* card, cabeçalho de tabela */
--ink-3:      #1D1D21;   /* linha em hover, campo */
--line:       #2B2B31;   /* borda, divisor */
--flame:      #EA580C;   /* ação primária, atraso */
--flame-deep: #B33A05;   /* pressed */
--ember:      #F97316;   /* foco, destaque em texto */
--paper:      #F7F5F3;   /* texto */
--paper-dim:  #A3A3AB;   /* rótulo, secundário */

--ok:         #4ADE80;   /* pago, ativo, entregue */
--warn:       #FBBF24;   /* vence hoje, atenção */
--bad:        #F87171;   /* falhou, cancelado, margem negativa */
```

⚠️ **Texto sobre `--flame` é `--ink`, nunca branco.** Branco dá 3,6:1 e reprova AA.

⚠️ **Laranja só em duas coisas: o botão primário da tela e o estado de atraso.** Painel escuro com laranja espalhado vira aplicativo de cripto. Se três elementos da tela estão laranja, o operador não sabe mais onde olhar — e essa tela existe justamente para ele saber onde olhar.

Verde, amarelo e vermelho são **de estado**, nunca de marca. Não entram em botão.

### Tipografia

| Papel | Face |
|---|---|
| Título de tela | **Archivo** variável, `wdth` 110, peso 700, 24px |
| Interface | **Archivo** variável, largura normal, 400–500, 14px base |
| Rótulo | **Archivo**, 13px, peso 600, caixa alta, tracking 0,06em, `--paper-dim` |
| Dado | **IBM Plex Mono**, 500, `tabular-nums` |

⚠️ **Todo dinheiro, data, contagem e telefone em mono com `tabular-nums`, alinhado à direita quando em coluna.** `R$ 1.234,56` embaixo de `R$ 89,90` em fonte proporcional não alinha, e o olho gasta trabalho corrigindo. Numa tela cujo trabalho é comparar valores, isso é falha de função, não de estética.

Base 14px, não 16px. Ferramenta densa usada por quem conhece a tela.

### Forma

Raio 4px em input e badge, 10px em card e botão. Borda 1px `--line` — sem sombra, exceto em diálogo e menu. Grade de 4px. Densidade de tabela: 44px por linha (alvo de toque no celular).

---

## Vocabulário e regras de negócio que toda tela precisa respeitar

Isto não é enfeite — é o que evita a tela inventar um comportamento que o servidor vai recusar, ou pior, que o servidor aceita e produz o número errado.

### Vocabulário fixo

Nomear na UI exatamente assim, nunca pelo termo técnico interno:

| Termo na tela | É | Nunca chamar de |
|---|---|---|
| **Cliente** | O assinante final (`Customer`) — quem recebe a cobrança | "usuário", "tenant" |
| **Plano** | Pacote comercial (`Plan`) — nome, ciclo, preço/custo **sugeridos** | — |
| **Assinatura** | O vínculo real cliente↔plano (`Subscription`) — preço e custo que valem de verdade vivem aqui, não no plano | — |
| **Fornecedor** | Quem vende o crédito revendido (`Supplier`) | "Supplier", "provider" |
| **Cobrança** | Um ciclo faturado (`Charge`) | "fatura", "boleto" (não emite boleto) |
| **Pagamento** | Dinheiro que entrou (`Payment`) | — |
| **Canal de WhatsApp** | Um dos três adapters configurados | "provider de mensageria" |
| **Régua** | A sequência de passos de cobrança automática (`DunningRule`) | "dunning", "cadência" |

### Dinheiro — sempre `R$ 0,00`, nunca dado bruto

Todo valor chega pronto do servidor já formatado ou como string em centavos — nunca como `number` fracionário. Se um mock ou protótipo usar `1234.56` como tipo de dado monetário, está simulando um bug real do sistema (`float` para dinheiro é proibido até em variável temporária). Ver [`../tecnico/04-dinheiro-e-margem.md`](../tecnico/04-dinheiro-e-margem.md).

### Preço e custo são por **assinatura**, não por plano

`Plan.priceCents`/`Plan.costCents` são só sugestão preenchida no formulário de criação. O valor que vale — o que o cliente paga e o que custa de verdade — mora em `Subscription.priceCents`/`Subscription.costCents`, negociado por cliente.

Consequência para a tela: **editar um plano nunca muda o que uma assinatura existente cobra.** Reajuste é ação na própria assinatura (ou reajuste em lote disparado a partir do fornecedor — ver alerta abaixo). Ver [`../tecnico/02-modelo-de-dados.md`](../tecnico/02-modelo-de-dados.md).

### Histórico é imutável — reajuste nunca é retroativo

`Charge.principalCents` e `Charge.costCents` são congelados no momento em que a cobrança é emitida. Reajustar preço ou custo de uma assinatura muda a **próxima** cobrança gerada; as cobranças já emitidas mantêm o valor antigo, e o relatório do mês passado não muda. Toda tela que mostra histórico (ficha do cliente, relatórios, timeline) está mostrando o valor congelado daquele ciclo, não o valor atual da assinatura.

Isso também vale para cobrança já paga: **não é editável nem cancelável**. Se a tela mostra um botão de editar ou cancelar numa cobrança `PAID`, é erro — o servidor vai recusar de qualquer forma, mas a tela não deve oferecer o que vai ser recusado.

### Faturado × Recebido — duas leituras de receita, nomear qual é qual

| Termo | Definição | Onde aparece |
|---|---|---|
| **Faturado** | Cobranças emitidas no período, pagas ou não | Painel de lucro/margem — casa a receita com o custo na mesma competência |
| **Recebido** | Pagamentos com data de pagamento no período | Fluxo de caixa |

⚠️ Custo é reconhecido **na emissão**, não no pagamento. Cliente inadimplente aparece como prejuízo — é a realidade: o crédito foi comprado do fornecedor e não foi pago pelo cliente. **Margem em risco** = custo já reconhecido de cobranças ainda em aberto — é o número que mais importa pra quem paga o fornecedor antes de receber do cliente.

⚠️ Rotular como **"lucro bruto"**, nunca "lucro" puro — não há módulo de despesa fixa (hospedagem, chip, contador). Ver [`../tecnico/04-dinheiro-e-margem.md`](../tecnico/04-dinheiro-e-margem.md).

### Data — sempre no fuso do negócio, nunca UTC cru nem fuso do navegador

Vencimento é `23:59:59` local. "Hoje", "atraso" e corte de relatório de mês são conceitos locais. Uma cobrança que vence 10/08 só fica atrasada depois da meia-noite local do dia 10 — não confundir com o instante UTC gravado no banco. Ver [`../tecnico/03-datas-e-ciclos.md`](../tecnico/03-datas-e-ciclos.md).

### Situação de cobrança — os únicos valores possíveis

`OPEN`, `OVERDUE`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`. "Vence hoje" **não é um status novo** — é uma cobrança `OPEN` cujo vencimento é a data de hoje; a tela deriva isso, não inventa um sexto estado no banco.

### Régua — estados e travas que a tela precisa expor, não esconder

- Estado da régua: `DRAFT` (rascunho) → `REVIEW` (calcula tudo, não envia nada) → `ACTIVE`. `PAUSED` existe no enum mas **não tem ação nenhuma que leve até lá** — não confundir com o kill switch abaixo, que é o controle de pausa real.
- Ativar a partir de `REVIEW` tem dois botões: **Ignorar retroativos e ativar** (descarta as execuções `PENDING_REVIEW` e a régua passa a valer só pra frente) e **Enviar todas** (ativa mantendo as execuções pendentes registradas, sem reprocessamento automático — não dispara nada retroativo). Fechar sem clicar em nenhum dos dois é a terceira opção, não precisa de botão próprio.
- Kill switch (`Settings.sendingPaused`) para tudo, na hora. Mensagem parada mais de 24h vira `CANCELLED` com motivo `stale` — não dispara tudo de uma vez quando o envio é retomado.
- Opt-out (cliente pediu pra sair) bloqueia envio em **todos** os canais, sempre.
- Quiet hours (padrão 08h–20h local): fora da janela, a mensagem **reagenda**, nunca é descartada.
- Um cliente recebe no máximo uma mensagem de cobrança por dia — mesmo com três cobranças vencidas, uma mensagem consolidada com o total.
- Ação manual acima de 100 mensagens exige o operador **digitar o número** pra confirmar, não um "tem certeza?".
- Ver [`../tecnico/06-regua-e-canais.md`](../tecnico/06-regua-e-canais.md) para o detalhe de cada trava (T5–T8).

### Canal de WhatsApp — cada provider tem limite diferente, a tela não pode fingir que são iguais

Três canais possíveis (`META_CLOUD`, `EVOLUTION`, `SALVY`), um ativo por vez via "canal padrão". Diferenças que aparecem na tela:

- **Evolution** roda num servidor do próprio cliente (VPS dele, fora do controle do sistema) e viola os Termos do WhatsApp — a tela de configuração desse canal mostra o aviso e registra o aceite.
- ⚠️ **Meta Cloud exige template pré-aprovado fora da janela de 24h por regra do WhatsApp, mas o sistema hoje não trata isso** — o motor de despacho manda o texto livre do passo direto pro adapter, sem checar se o canal exige template aprovado. Isso é um risco real de produto se a Meta Cloud virar canal padrão, não só um detalhe de tela. Não desenhar uma tela que finge que esse tratamento existe.
- Nenhum canal falha em silêncio: erro do provider aparece sanitizado (sem token) e a mensagem que não pôde sair mostra o motivo na timeline, nunca some sem explicação.
- Credencial de canal **nunca** volta pra tela, nem mascarada — mostra só "configurado em DD/MM" e um botão de substituir.

### Credencial de acesso do assinante — a senha que o cliente usa pra assistir

Diferente de credencial de canal: essa é mostrável, mas **auditada**. Mascarada por padrão (`••••••••`); revelar grava quem viu e quando **antes** de mostrar o valor, e o valor some da tela ao fechar o diálogo. Nunca aparece em log, export ou mensagem de template.

### Alertas de margem — o motivo de cada um

| Alerta | Dispara quando |
|---|---|
| Margem negativa | Preço da assinatura ficou ≤ custo da assinatura |
| Margem abaixo do limite | Margem da assinatura abaixo do percentual configurado em Ajustes (padrão 30%) |
| Custo do fornecedor subiu | Editar o custo padrão do fornecedor mostra quantas assinaturas caem abaixo do limite e oferece reajuste em lote |
| Cliente bom em atraso | Cliente com faturado acumulado acima da média tem cobrança vencida agora |

⚠️ Reajuste em lote muda o preço/custo da **assinatura** dali pra frente. Não toca em cobrança já emitida — ver "Histórico é imutável" acima.

---

## Elemento de assinatura — a linha de vencimento

O dashboard **não** abre com quatro cards de estatística. É a resposta template, e não é o que ele pergunta ao abrir.

Ele pergunta uma coisa: **quem eu preciso cobrar hoje.**

A tela abre com uma faixa horizontal ancorada em hoje, mostrando onde as cobranças estão em relação ao vencimento — o mesmo eixo da régua de cobrança:

```
┌──────────────────────────────────────────────────────────────┐
│  ATRASO                          HOJE            A VENCER    │
│   +7      +3      +1      │        0        │   -2      -5   │
│   ▇▇      ▇▇▇     ▇▇      │       ▇▇▇▇      │  ▇▇▇     ▇▇    │
│    3       6       4      │         8       │    5      11   │
│  R$135   R$290   R$180    │      R$385      │ R$240   R$495  │
└──────────────────────────────────────────────────────────────┘
      ← laranja ─────────────  amarelo  ──────── cinza →
```

- Cada coluna é clicável e filtra a lista abaixo. A faixa **é** a navegação, não enfeite.
- Colunas de atraso em `--flame`, hoje em `--warn`, a vencer em `--paper-dim`.
- Contagem e valor em mono.
- "+N" é cobrança `OVERDUE` há N dias; "-N" é `OPEN` com N dias até o vencimento. Nenhum desses é um status próprio — são derivados de `dueAt` contra hoje, no fuso local.
- Formalmente ecoa a faixa de programação do site — mesma família visual, conteúdo diferente. Sem repetir.

Abaixo dela, a lista filtrada. Os totais do mês ficam **depois**, não antes: ele confere lucro uma vez por semana e cobra todo dia.

---

## Telas

```
┌───────────┬──────────────────────────────────────────────┐
│ [MT]      │  Título da tela          [ Ação primária ]   │
│           ├──────────────────────────────────────────────┤
│ Início    │                                              │
│ Clientes  │                                              │
│ Cobranças │              conteúdo                        │
│ Mensagens │                                              │
│ Régua     │                                              │
│ Leads     │                                              │
│ Relatórios│                                              │
│ ───────── │                                              │
│ Fornecedores                                             │
│ Planos    │                                              │
│ Ajustes   │                                              │
│           │                                              │
│ [⏸ Pausar]│  ← kill switch, sempre visível               │
└───────────┴──────────────────────────────────────────────┘
```

Sidebar 240px no desktop, gaveta no mobile. Item ativo marcado por **barra de 2px `--flame` na borda esquerda** e texto `--paper` — não por fundo laranja.

### Início

Linha de vencimento (acima) → lista filtrada → totais do mês → alertas de margem.

Alerta de margem negativa aparece como faixa acima da lista, borda esquerda `--bad`, com o número de assinaturas afetadas e link para a lista. Não é toast — é condição persistente.

### Clientes

Tabela: nome · telefone · plano · fornecedor · próximo vencimento · situação. Busca por nome, telefone **e usuário de acesso**. Filtro por situação e fornecedor em `searchParams`.

### Ficha do cliente

Painel de lucro no topo — é o que ele mais gosta de ver:

```
┌────────────────────────────────────────────────┐
│ João Silva          cliente desde 03/2021      │
│ Fornecedor: Tubarão               ● ATIVO      │
├────────────────────────────────────────────────┤
│ Faturado   Recebido    Custo   Lucro   Margem  │
│ R$2.640    R$2.580    R$680   R$1.960    74%  │
└────────────────────────────────────────────────┘
```

Tudo em mono. Margem em `--ok` acima do limite, `--warn` abaixo, `--bad` se negativa.

Esses números são **soma sobre o histórico de cobranças do cliente** ("Faturado", "Custo" = `SUM(charge.principalCents - discountCents)` e `SUM(charge.costCents)` de cada cobrança já emitida, cada uma com o valor congelado do próprio ciclo). Não é "preço atual × número de ciclos" — um cliente que teve reajuste no meio do caminho mostra a mistura real de valores antigos e novos.

Abas: **Assinaturas · Cobranças · Mensagens**.

### Assinatura (dentro da ficha do cliente)

Mostra plano, ciclo (mensal/trimestral/semestral/anual), preço atual, custo atual, dia de vencimento e fornecedor.

⚠️ **Editar preço ou custo aqui é uma ação forward-only.** O formulário não permite "aplicar retroativo" — essa opção não existe no sistema. O texto de apoio deixa isso explícito: *"O novo valor vale a partir da próxima cobrança gerada. Cobranças já emitidas não mudam."*

Trocar de plano copia o novo ciclo e as sugestões de preço/custo pro formulário, mas o operador confirma — não substitui em silêncio o preço negociado.

⚠️ **Dia de vencimento não é um campo editável — é sempre calculado.** Vale a regra: vencimento do próximo ciclo = data em que o cliente pagou o ciclo atual + duração do ciclo (mesmo dia do mês seguinte, com o mesmo clamp de fim de mês: pagou 31/01 → mostra vencimento 28/02, e isso é esperado, não bug). A tela nunca oferece um campo pra digitar ou alterar o dia de vencimento diretamente — só mostra o resultado. Cliente que atrasa e paga em outro dia muda o dia de vencimento de todos os ciclos seguintes; a ficha não avisa isso como erro, é o comportamento correto.

### Credencial de acesso

Na assinatura:

```
Usuário    joao.silva
Senha      ••••••••   [ Revelar ]
```

⚠️ Revelar dispara auditoria no servidor **antes** de mostrar. Comportamento na tela:

- Diálogo com o valor e um botão de copiar
- Aviso discreto: **"Este acesso foi registrado."** Fato, não ameaça
- Fecha em 30 segundos ou ao clicar fora, e o valor sai do DOM
- ❌ Nunca renderizar a senha na página por trás de `filter: blur()`. O valor estaria no HTML

### Cobranças

Tabela: cliente · valor · vencimento · situação · dias de atraso. Situação como badge — os únicos cinco valores possíveis, direto do banco (mais "vence hoje", derivado):

| Situação | Cor |
|---|---|
| Em aberto | `--paper-dim`, borda `--line` |
| Vence hoje | `--warn` |
| Em atraso | `--flame` |
| Parcialmente paga | `--warn`, com valor restante |
| Paga | `--ok` |
| Cancelada | `--paper-dim`, texto riscado |

Ação principal na linha: **Registrar pagamento**. Diálogo com valor pré-preenchido pelo saldo, data padrão hoje, forma padrão Pix. Três campos, submit desabilitado durante o envio.

⚠️ Cobrança com pagamento registrado **não mostra** a opção de cancelar nem de editar valor. A regra é do servidor; a interface não oferece o que vai ser recusado.

### Mensagens

Lista com situação, e a timeline dentro da ficha do cliente:

```
05/08  ✓ Enviado   D-5 lembrete           09:03
08/08  ✓ Enviado   D-2 lembrete com Pix   09:01
11/08  ⊘ Pulado    D+1 aviso              pagamento confirmado
11/08  ✓ Pago      R$ 60,00 via Pix       registro manual
```

Marcadores: `✓` em `--ok`, `⊘` em `--paper-dim`, `✕` em `--bad`. Falha mostra o motivo em texto, não em código (`opted_out`, `pagamento confirmado`, `template não aprovado` — nunca o enum cru). É a resposta para "por que meu cliente recebeu essa mensagem?" — a pergunta de suporte mais comum do domínio.

Mensagem pode ser da régua automática (`DUNNING`) ou disparo manual assistido (`MANUAL` — o operador filtra clientes e dispara em lote fora da régua, mesma trava de confirmação acima de 100). A tela distingue as duas origens.

### Régua

⚠️ **A tela já existe e está no ar** (`/regua`). Não é mais uma tela pra desenhar do zero — é documentação do que foi construído, em [`03-handoff-regua.md`](./03-handoff-regua.md). Cole os dois handoffs juntos no Claude Design antes de pedir qualquer ajuste nessa área.

Resumo do que existe de verdade: uma única régua (sem lista, sem "nova régua", sem trocar qual é padrão), header com nome + badge de estado, faixa de revisão quando `EM REVISÃO` com dois botões de ativação, e uma lista vertical de cards de passo — **não** um eixo horizontal D-5…D+5. Detalhe campo a campo, o que existe e o que não existe, está todo no handoff dedicado.

### Canais

Um card por provider (Meta Cloud, Evolution, Salvy). Cada card mostra: situação (configurado/não configurado, último teste de conexão ok/falhou), qual é o canal padrão (só um por vez), e nunca a credencial em si.

⚠️ Canal padrão inativo ou falhando **não** faz failover automático pra outro canal — a tela mostra a falha, não troca de canal sozinha. Falha visível é melhor que mensagem saindo por um número que o cliente não esperava.

Card do Evolution mostra o aviso de que roda em servidor do próprio cliente e viola os Termos do WhatsApp, com registro de aceite obrigatório antes de ativar.

### Kill switch

Botão fixo no rodapé da sidebar. Estado normal: fantasma, borda `--line`, texto `--paper-dim`, rótulo **"Pausar envios"**.

Quando pausado: fundo `--flame`, texto `--ink`, rótulo **"Envios pausados — retomar"**, e uma faixa fina `--flame` no topo de todas as telas.

Não fica em Ajustes. Quando ele precisa disso, precisa agora.

### Leads

Entram pelo formulário do site. Tabela: nome · WhatsApp · plano de interesse · origem · quando · situação (`Novo`, `Contatado`, `Convertido`, `Descartado`). Ação principal: **Converter em cliente**, que abre o cadastro pré-preenchido.

⚠️ Telefone repetido **não** é bloqueado nem escondido aqui — a mesma pessoa pode preencher o formulário duas vezes, e recusar o segundo envio esconde um lead real. Se a tela quer sinalizar duplicidade, é indicação visual, não bloqueio.

### Fornecedores

Tabela: nome · custo padrão por ciclo · quantas assinaturas ativas · margem média. Editar o custo padrão do fornecedor **não** muda assinatura nenhuma sozinho — dispara o alerta "custo subiu" com a lista de assinaturas que caem abaixo do limite de margem e a opção de reajuste em lote (que edita `priceCents`/`costCents` das assinaturas afetadas, forward-only, mesma regra de "Histórico é imutável").

### Planos

Tabela: nome · ciclo · preço sugerido · custo sugerido · fornecedor · assinaturas ativas. Formulário simples — nome, ciclo, fornecedor, preço e custo sugeridos.

⚠️ Rótulo do campo de preço/custo aqui é literalmente **"sugerido"** ou "valor padrão do plano" — nunca "preço", sem qualificador, porque o valor que vale de verdade está na assinatura, não aqui. Editar um plano existente não abre um fluxo de "aplicar a todos os clientes" — esse fluxo não existe pra plano, só pra fornecedor (acima).

### Configurações

Campos: nome do negócio, fuso horário (padrão `America/Sao_Paulo`), chave Pix e nome do titular (usada nos templates de cobrança), horário de silêncio da régua (início/fim, padrão 08h–20h), percentual de alerta de margem (padrão 30%), troca de senha do usuário.

Kill switch **não** mora aqui — fica fixo na sidebar (ver acima). Esta tela é configuração de baixa frequência, não controle de emergência.

---

## Regras de interação

- **Ação destrutiva pede confirmação** — cancelar cobrança, desconectar canal, anonimizar cliente. Diálogo nomeia o que será afetado, não "Tem certeza?".
- **Ação em massa acima de 100 mensagens exige digitar o número.** Trava de produto: "Digite 247 para confirmar." Vale tanto pra ativação da régua quanto pra disparo manual assistido.
- **Toda lista trata carregando, erro e vazio.** Vazio aponta para a ação: "Nenhum cliente ainda — [Cadastrar o primeiro]". "Nenhum registro encontrado" não é estado vazio, é beco sem saída.
- **Carregando é skeleton na forma do conteúdo**, não spinner de tela cheia.
- Erro nomeia o que aconteceu e o que fazer, na voz da interface. Sem pedido de desculpa, sem vago.
- Filtro e paginação na URL. Ele compartilha link e volta pelo histórico.
- Botão de submit desabilita durante o envio. Duplo clique em "Registrar pagamento" não pode virar dois pagamentos.

## Escrita

Português do Brasil, sentence case, voz ativa.

- Botão diz o que acontece: **"Registrar pagamento"**, não "Salvar". **"Pausar envios"**, não "Desativar".
- O nome da ação se mantém do início ao fim: botão "Registrar pagamento" → aviso "Pagamento registrado".
- Nomear pelo que ele controla, não pelo que o sistema é: **"Canal de WhatsApp"**, não "Provider de mensageria". **"Fornecedor"**, não "Supplier".
- ❌ "Ops!", "Algo deu errado", "Sucesso!". ✅ "Não foi possível enviar: o canal está desconectado. [Verificar canal]".

## Qualidade — piso não negociável

- Funciona no celular. Tabela vira lista de cartões abaixo de 768px, com as três informações que importam.
- Foco de teclado visível: `outline: 2px solid var(--ember); outline-offset: 2px`.
- Alvo de toque mínimo 44×44px.
- Diálogo com foco preso, `Esc` fecha, foco volta ao gatilho.
- Cor nunca é o único portador de significado — situação tem cor **e** texto.
- `prefers-reduced-motion` respeitado.
- Sem animação decorativa. Transição existe para dar continuidade, não para impressionar.
