# 01 — Handoff de design · Site MT Conexões

> Cole isto no Claude Design. Documento autocontido.
> Spec técnica em [`../tecnico/08-site.md`](../tecnico/08-site.md) · marca completa em [`00-marca.md`](./00-marca.md).

## O que é

Site público de **MT Conexões**, revenda de assinatura digital no Brasil. Público: famílias e torcedores, celular na mão, WhatsApp aberto o dia inteiro, pouca paciência com formulário longo.

**A página tem um trabalho só: virar mensagem no WhatsApp ou lead no formulário.** Tudo que não serve a isso sai.

Stack: **Astro**, HTML estático, Cloudflare Pages. Menos de 20 KB de JS por página — interatividade é ilha, não página. Só duas ilhas existem: menu mobile e formulário.

---

## Direção visual

O nicho inteiro se parece: fundo escuro, gradiente neon roxo-ciano, Poppins, card com borda brilhante. Não vamos para lá.

A referência é **televisão**: bug de canal no canto da tela, grade de programação, badge de AO VIVO, lower-third de esporte. Preto e laranja escuro tratados como identidade de transmissão, não como tema escuro de dashboard.

### Cor

```css
--ink:        #0B0B0C;   /* fundo */
--ink-2:      #141417;   /* card */
--ink-3:      #1D1D21;   /* elevado, hover */
--line:       #2B2B31;   /* borda */
--flame:      #EA580C;   /* ação primária */
--flame-deep: #B33A05;   /* pressed */
--ember:      #F97316;   /* destaque em texto */
--paper:      #F7F5F3;   /* texto */
--paper-dim:  #A3A3AB;   /* texto secundário */
```

⚠️ **Texto sobre `--flame` é `--ink`, nunca branco.** Branco sobre laranja dá 3,6:1 e reprova AA. Preto sobre laranja dá 5,4:1.

⚠️ Laranja aparece em **botão primário, símbolo e indicador ao vivo**. Em mais nada. Card laranja, borda laranja e ícone laranja na mesma tela matam a hierarquia — e é exatamente o que o resto do nicho faz.

❌ Gradiente. ❌ Glow. ❌ Borda brilhante.

### Tipografia

Uma superfamília variável cobre display e corpo pelo eixo de largura. Um arquivo, uma requisição.

| Papel | Face |
|---|---|
| Display | **Archivo** variável, `wdth` 115–125, peso 800, tracking −0,03em |
| Corpo | **Archivo** variável, largura normal, 400–500, 16px mínimo, linha 1,6 |
| Dado | **IBM Plex Mono**, 500, `tabular-nums` — preço, contagem, horário |

Mono em preço e número não é estilo: é o que faz coluna de valor alinhar, e empresta a leitura de placar e de grade de programação que a marca quer.

### Forma

Raio 10px em card e botão, 4px em badge. Card se separa do fundo por **borda 1px `--line`**, não por sombra — sombra em preto vira borrão. Grade de 4px. Respiro entre seções: 96px desktop, 64px mobile.

---

## Elemento de assinatura — a faixa de programação

O hero **não** abre com "18.000 canais" em número gigante com gradiente. Isso é o card de estatística que todo site do nicho tem.

Abre com uma **faixa horizontal em formato de grade de programação**: colunas de gênero com marcadores de horário no topo, badge `AO VIVO` pulsando em uma delas. É o artefato que o cliente reconhece da TV dele.

```
┌─────────────────────────────────────────────────────────────┐
│  20:00        20:30        21:00        21:30        22:00  │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ ● AO VIVO    │              │              │                │
│ FUTEBOL      │ FILMES       │ SÉRIES       │ INFANTIL       │
│              │              │              │                │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

- Rola horizontalmente com `scroll-snap`, sem JS.
- Marcadores de horário em mono, `--paper-dim`.
- Um bloco tem o ponto `● AO VIVO` em `--flame`, pulsando. **É a única animação em loop do site inteiro.**
- Bordas 1px `--line` formando a grade. Sem preenchimento colorido — a grade é a forma.

⚠️ **Rótulos de gênero, nunca nomes de programa.** Escrever "Brasileirão · 20:00" numa grade ilustrativa é inventar uma programação que não existe. Gênero é honesto e funciona igual.

Se a animação for desligada por `prefers-reduced-motion`, o ponto fica estático em `--flame`. O layout não muda.

---

## Estrutura da página

Rolagem longa, no mesmo espírito do modelo de referência, com as correções listadas no fim.

```
┌──────────────────────────────────────────┐
│ [MT] MT Conexões    Planos Canais Blog   │  ← header fixo, 64px
│                          [Falar agora]   │
├──────────────────────────────────────────┤
│                                          │
│  Sua TV completa,                        │  ← display-xl, 2 linhas
│  sem contrato e sem antena.              │
│                                          │
│  Subtítulo em uma linha, direto.         │
│                                          │
│  [ Testar agora ]  [ Ver planos ]        │
│                                          │
│  ┌────────────────────────────────────┐  │  ← FAIXA DE PROGRAMAÇÃO
│  │ ● AO VIVO │ FILMES │ SÉRIES │ ...  │  │     (assinatura)
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  Funciona em      [ícones dos apps]      │  ← faixa de compatibilidade
├──────────────────────────────────────────┤
│  Por que MT Conexões                     │  ← 4 blocos, sem card
│  ─────────  ─────────  ─────────  ────   │
├──────────────────────────────────────────┤
│  ESCOLHA SEU PLANO                       │
│  ┌────────┐ ┌════════┐ ┌────────┐        │  ← 3 cartões, o do meio
│  │ MENSAL │ ║TRIMEST.║ │ ANUAL  │        │     com borda --flame
│  │ R$ XX  │ ║ R$ XX  ║ │ R$ XX  │        │
│  │ [Assinar] ║[Assinar]│ [Assinar]       │
│  └────────┘ └════════┘ └────────┘        │
├──────────────────────────────────────────┤
│  Como começar                            │  ← 3 passos NUMERADOS
│  01 ──── 02 ──── 03                      │     (é sequência real)
├──────────────────────────────────────────┤
│  O que é IPTV                            │  ← bloco editorial, 2 col
├──────────────────────────────────────────┤
│  Perguntas frequentes                    │  ← acordeão, 5 aqui
├──────────────────────────────────────────┤
│  Ainda com dúvida?                       │  ← conversão final
│  [ Chamar no WhatsApp ]  ou formulário   │
├──────────────────────────────────────────┤
│  Rodapé                                  │
└──────────────────────────────────────────┘
```

### Notas por bloco

**Header** — fixo, 64px, fundo `--ink` com 90% de opacidade e `backdrop-filter`. Logo à esquerda, navegação ao centro, botão à direita. No mobile: logo + botão de WhatsApp visível, resto no menu.

**Hero** — título em duas linhas, quebra controlada por `<br>` no desktop e livre no mobile. Dois botões: primário `--flame` com texto `--ink`, secundário com borda `--line` e texto `--paper`.

**Compatibilidade** — faixa baixa, logos dos aplicativos em escala de cinza, opacidade 60%, ganhando cor no hover. Serve de prova social sem depoimento inventado.

**Por que** — quatro blocos **sem card**: só um traço de 32px em `--flame` no topo, título e duas linhas. Card em tudo achata a hierarquia.

**Planos** — três cartões. O do meio é o recomendado: borda `--flame` 1px, badge `MAIS ESCOLHIDO` no topo, e **um degrau a mais de escala**, não um card gigante. Preço em mono, tamanho display-lg, com `R$` menor e alinhado ao topo dos dígitos.

**Como começar** — aqui a numeração `01 02 03` se justifica: é sequência real, a ordem carrega informação. É o **único** lugar do site com marcador numerado.

**O que é IPTV** — bloco editorial de duas colunas no desktop, uma no mobile. É o conteúdo que traz busca informacional. Tipografia de leitura: 18px, medida de 65 caracteres, não texto largo de ponta a ponta.

**FAQ** — acordeão nativo com `<details>`/`<summary>`, zero JS. Cinco perguntas aqui; as outras na página dedicada. ⚠️ As cinco daqui **não se repetem literalmente** na página de FAQ — conteúdo duplicado faz as duas competirem entre si.

**Conversão final** — WhatsApp primeiro, formulário como alternativa visível. Não esconder o formulário atrás de "ou preencha o formulário" em link pequeno.

**Rodapé** — três colunas: navegação, suporte, contato. Logo em versão reduzida.

---

## Conversão

Este é o ponto onde o modelo de referência falha: os seis CTAs dele apontam para o mesmo link encurtado. Não dá para saber qual seção converte.

- Cada CTA leva `?utm_source`, `utm_medium`, `utm_campaign` e um atributo `data-cta` distinto.
- O deeplink de WhatsApp leva **texto pré-preenchido diferente por origem**. Quem clica no card do trimestral manda uma mensagem que já diz isso. O dono lê e sabe de onde veio, sem ferramenta nenhuma.
- Botão de WhatsApp flutuante no mobile, canto inferior direito, aparecendo depois de 30% de rolagem. `--flame`, ícone `--ink`, 56px. `aria-label` explícito.
- Formulário: **nome, WhatsApp, plano de interesse**. Três campos. Cidade opcional. Mais que isso derruba conversão sem trazer informação que a conversa não traga.

---

## Escrita

Português do Brasil, frase direta, sem jargão técnico. O leitor não sabe o que é *streaming device* nem *EPG*.

- Botão diz o que acontece: **"Chamar no WhatsApp"**, não "Saiba mais". **"Testar agora"**, não "Comece já".
- O nome da ação é o mesmo do começo ao fim. Botão "Testar agora" leva a uma conversa sobre teste, não sobre assinatura.
- Rótulo rotula, exemplo demonstra. Nada faz duas coisas.
- ❌ "Revolucione sua experiência", "a melhor solução do mercado", "Aproveite!". ❌ Ponto de exclamação em série. ❌ Emoji decorativo.
- Erro de formulário diz o que aconteceu e como resolver: **"Digite o WhatsApp com DDD"**, não "Campo inválido".
- Sucesso: **"Recebemos. O contato chega em até X minutos no seu WhatsApp."** Prometa só o que o dono cumpre.

---

## ⚠️ O que não copiar do modelo de referência

| Antipadrão | Por quê | O que fazer |
|---|---|---|
| Endereço genérico de fachada | Risco jurídico e sinal negativo de confiança | Endereço real ou nenhum |
| Depoimentos com iniciais e cidade | É o padrão que o sistema de conteúdo útil do Google penaliza — e derruba site inteiro, não página | Depoimento real com autorização, ou nenhum. Faixa de compatibilidade cobre a prova social |
| Estatísticas inventadas ("92% de conversão") | Número sem fonte é passivo | Só número verificável. Na dúvida, corta |
| Termo repetido 30+ vezes | Não ajuda ranking e sinaliza baixa qualidade | Escrever para pessoa |
| Todos os CTAs no mesmo link | Zero atribuição | Um `data-cta` por botão |
| Home cobrindo tudo que as internas cobrem | Canibalização — as duas competem | Uma intenção de busca por página |

---

## Qualidade — piso não negociável

- Mobile primeiro. O público está no celular; o desktop é o caso secundário.
- LCP < 1,8s · INP < 200ms · CLS < 0,1, em 4G simulado. Imagem com `width`/`height` sempre declarados.
- Foco de teclado visível: `outline: 2px solid var(--ember); outline-offset: 2px`.
- Alvo de toque mínimo 44×44px.
- Botão com ícone só tem `aria-label`.
- Acordeão de FAQ é `<details>` nativo — funciona sem JS e é acessível de graça.
- `prefers-reduced-motion` desliga tudo, inclusive o pulso do AO VIVO.
- Sem carrossel automático. Sem contador animado. Sem texto que se digita sozinho.
