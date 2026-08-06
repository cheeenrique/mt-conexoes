# 00 — Marca MT Conexões

> Fonte da verdade de logo, cor e tipografia. Os handoffs do [site](./01-handoff-site.md) e do [painel](./02-handoff-painel.md) repetem o essencial para poderem ser colados isolados.

## Posicionamento visual

O nicho inteiro se parece: fundo escuro, gradiente neon roxo-ciano, Poppins, card com borda brilhante. MT Conexões vai para outro lugar usando a mesma restrição de cor: **preto e laranja escuro tratados como identidade de transmissão**, não como tema escuro genérico.

A referência visual não é software. É **televisão**: bug de canal no canto da tela, grade de programação, badge de AO VIVO, lower-third de esporte. É o mundo que o cliente reconhece sem precisar de explicação.

---

## Logo

Duas partes: **símbolo** (monograma MT) e **assinatura** (`MT Conexões` ao lado).

### Símbolo — bug de canal

Quadrado com cantos arredondados, como o logotipo que fica no canto da tela durante a transmissão. Dentro, o monograma.

```
┌──────────────┐
│   ▄▄   ▄▄▄   │     M e T dividem a haste central.
│   ██▄▄██ █   │     A travessa do T sai pela direita
│   ██  ██ █ ──│     como três traços decrescentes.
│   ██  ██ █ ──│
│              │
└──────────────┘
```

Construção:

- Quadrado de 64×64 na grade base, raio de canto 14 (≈22%). Não é círculo, não é quadrado reto — o raio é o que dá leitura de "bug de TV".
- Monograma em maiúsculas, peso pesado, largura estreita. A perna direita do **M** e a haste do **T** são **a mesma haste** — é o que faz duas letras virarem uma marca.
- Três traços saindo da travessa do T, decrescentes da esquerda para a direita, espaçamento igual à espessura da haste. É sinal, é conexão, e é o único elemento com movimento implícito.
- Traços em `--ember`; letras e quadrado no par principal.

**Duas versões, ambas obrigatórias:**

| Versão | Quadrado | Letras | Uso |
|---|---|---|---|
| Positiva | `--flame` | `--ink` | Fundo preto — padrão |
| Reduzida | transparente, borda `--line` 2px | `--paper` | Rodapé, documento, fundo claro |

### Assinatura

`MT` em peso 800, largura expandida. `Conexões` em peso 400, largura normal, na mesma altura de x. Sem espaço entre as palavras além do normal — não é `MT  Conexões`.

```
┌────┐
│ MT │  MT Conexões
└────┘
```

- Espaço entre símbolo e texto: metade da largura do símbolo.
- Alinhamento vertical pela altura das maiúsculas, não pela caixa.
- Área de respiro em volta: metade da altura do símbolo, em todos os lados. Nada entra aí.

### Regras

- **Tamanho mínimo do símbolo: 24 px.** Abaixo disso os três traços empastam — usar o monograma sem traços.
- Favicon é só o símbolo, versão positiva, 32×32 e 16×16 desenhados separadamente (não escalados).
- ❌ Nunca esticar, rotacionar, aplicar sombra, contorno ou gradiente.
- ❌ Nunca sobre foto sem uma caixa sólida atrás.
- ❌ Nunca recolorir. Laranja e preto, e a versão reduzida. Só.

---

## Cor

Laranja escuro como **ação e sinal ao vivo**. Nunca como decoração.

```css
--ink:        #0B0B0C;   /* fundo da página */
--ink-2:      #141417;   /* card, superfície */
--ink-3:      #1D1D21;   /* elevado, hover */
--line:       #2B2B31;   /* borda, divisor */

--flame:      #EA580C;   /* ação primária, símbolo */
--flame-deep: #B33A05;   /* pressed, borda de foco */
--ember:      #F97316;   /* texto de destaque sobre escuro */

--paper:      #F7F5F3;   /* texto principal */
--paper-dim:  #A3A3AB;   /* texto secundário */

--ok:         #4ADE80;   /* pago, ativo, entregue */
--warn:       #FBBF24;   /* vence hoje, atenção */
--bad:        #F87171;   /* falhou, cancelado */
```

### ⚠️ Contraste — a regra que mais se erra

**Texto sobre `--flame` é `--ink`, nunca branco.**

| Combinação | Razão | Veredito |
|---|---|---|
| `--flame` sobre `--ink` | 5,4:1 | ✅ AA |
| `--ember` sobre `--ink` | 6,7:1 | ✅ AA |
| `--ink` sobre `--flame` | 5,4:1 | ✅ AA — **use este no botão** |
| `--paper` sobre `--flame` | 3,6:1 | ❌ reprova AA |
| `--paper-dim` sobre `--ink` | 8,9:1 | ✅ AA |

Botão laranja com texto branco é o erro mais provável deste projeto, e é reprovação de acessibilidade direta.

### Disciplina de uso

- Laranja aparece em: **botão primário**, **símbolo**, **indicador ao vivo**, **estado de atraso**. Em mais nada.
- Uma tela com três coisas laranja não tem hierarquia. Se tudo chama atenção, nada chama.
- Vermelho, verde e amarelo são **de estado**, nunca de marca. Não entram em botão nem em decoração.
- ❌ Gradiente laranja. ❌ Glow. ❌ Borda brilhante. É o visual padrão do nicho, e é justamente o que se está evitando.

---

## Tipografia

Uma superfamília variável faz display **e** corpo, usando o eixo de largura. Uma requisição de fonte, um arquivo — decisão de identidade que também é decisão de performance.

| Papel | Face | Como usar |
|---|---|---|
| Display | **Archivo** variável, largura expandida (`wdth` 110–125), peso 700–800 | Títulos. Tracking negativo (−0,02em). Caixa alta só em rótulo curto |
| Corpo | **Archivo** variável, largura normal, peso 400–500 | Texto corrido, 16px mínimo, altura de linha 1,6 |
| Dado | **IBM Plex Mono**, peso 400–600 | Preço, valor, contagem, data, código. `font-variant-numeric: tabular-nums` |

**Por que mono para dinheiro:** coluna de valores em fonte proporcional não alinha. `R$ 1.234,56` embaixo de `R$ 89,90` com dígitos de largura variável é ruído que o olho tem que corrigir. Tabular resolve, e ainda empresta a leitura de placar e de guia de programação que a marca quer.

### Escala

```
display-xl   clamp(2.75rem, 7vw, 4.5rem)   800 / wdth 120 / -0.03em / 1.02
display-lg   clamp(2rem, 4.5vw, 3rem)      800 / wdth 115 / -0.02em / 1.08
title        1.5rem                        700 / wdth 110 / -0.01em / 1.2
body-lg      1.125rem                      400 / 1.6
body         1rem                          400 / 1.6
label        0.8125rem                     600 / wdth 100 / 0.06em / caixa alta
data         1rem                          500 / mono / tabular-nums
```

### Carregamento

- Self-hosted `woff2`, subset latino + pontuação pt-BR. ❌ Google Fonts por CDN — requisição de terceiro no caminho crítico e passivo de LGPD.
- `font-display: swap`, `preload` só na variável do display.
- Duas famílias, dois arquivos. Nada além disso.

---

## Forma e espaço

- **Raio:** 4px em input e badge · 10px em card e botão · 14px no símbolo. Nada totalmente redondo além de avatar e ponto de status.
- **Borda:** 1px `--line`. Card se separa do fundo por borda, não por sombra — sombra em fundo preto vira borrão.
- **Sombra:** só em elemento flutuante (diálogo, menu). `0 16px 40px rgba(0,0,0,.6)`.
- **Espaço:** grade de 4px. Respiro entre seções de página: 96px no desktop, 64px no mobile.
- **Foco:** `outline: 2px solid var(--ember); outline-offset: 2px`. Visível em tudo que recebe teclado. Nunca `outline: none` sem substituto.

## Movimento

- Duração 150ms em micro-interação, 300ms em entrada de elemento. `cubic-bezier(.2,.8,.2,1)`.
- O ponto de AO VIVO pulsa. **É a única animação em loop do projeto inteiro.**
- `@media (prefers-reduced-motion: reduce)` desliga tudo, inclusive o pulso.
- ❌ Parallax, contador animado, texto que digita sozinho, elemento que entra em cascata na rolagem. É o vocabulário de site gerado, e derruba INP.
