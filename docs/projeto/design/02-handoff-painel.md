# 02 — Handoff de design · Painel MT Conexões

> Cole isto no Claude Design. Documento autocontido.
> Spec técnica em [`../tecnico/`](../tecnico/) · marca completa em [`00-marca.md`](./00-marca.md).

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
--bad:        #F87171;   /* falhou, cancelado */
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
│ R$2.640    R$2.580    R$680   R$1.960    74%   │
└────────────────────────────────────────────────┘
```

Tudo em mono. Margem em `--ok` acima do limite, `--warn` abaixo, `--bad` se negativa.

Abas: **Assinaturas · Cobranças · Mensagens**.

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

Tabela: cliente · valor · vencimento · situação · dias de atraso. Situação como badge:

| Situação | Cor |
|---|---|
| Em aberto | `--paper-dim`, borda `--line` |
| Vence hoje | `--warn` |
| Em atraso | `--flame` |
| Paga | `--ok` |
| Cancelada | `--paper-dim`, texto riscado |

Ação principal na linha: **Registrar pagamento**. Diálogo com valor pré-preenchido pelo saldo, data padrão hoje, forma padrão Pix. Três campos, submit desabilitado durante o envio.

⚠️ Cobrança com pagamento registrado **não mostra** a opção de cancelar. A regra é do servidor; a interface não oferece o que vai ser recusado.

### Mensagens

Lista com situação, e a timeline dentro da ficha do cliente:

```
05/08  ✓ Enviado   D-5 lembrete           09:03
08/08  ✓ Enviado   D-2 lembrete com Pix   09:01
11/08  ⊘ Pulado    D+1 aviso              pagamento confirmado
11/08  ✓ Pago      R$ 60,00 via Pix       registro manual
```

Marcadores: `✓` em `--ok`, `⊘` em `--paper-dim`, `✕` em `--bad`. Falha mostra o motivo em texto, não em código. É a resposta para "por que meu cliente recebeu essa mensagem?".

### Régua

Editor de passos no eixo do vencimento, mesma linguagem da linha de vencimento do início:

```
  D-5 ──── D-2 ──── D0 ──── D+1 ──── D+3 ──── D+5
   ✉        ✉        ✉        ✉        ✉        ⏸
```

Estado da régua no topo, como faixa:

| Estado | Tratamento |
|---|---|
| `RASCUNHO` | cinza |
| `EM REVISÃO` | `--warn`, com "X mensagens sairiam hoje" e as três opções de ativação |
| `ATIVA` | `--ok`, discreta |
| `PAUSADA` | `--flame` |

⚠️ A tela de revisão mostra **a lista real** de quem receberia, não só o número. Ativar sem ver a lista é como se manda cobrança para quem já pagou.

### Kill switch

Botão fixo no rodapé da sidebar. Estado normal: fantasma, borda `--line`, texto `--paper-dim`, rótulo **"Pausar envios"**.

Quando pausado: fundo `--flame`, texto `--ink`, rótulo **"Envios pausados — retomar"**, e uma faixa fina `--flame` no topo de todas as telas.

Não fica em Ajustes. Quando ele precisa disso, precisa agora.

### Leads

Entram pelo formulário do site. Tabela: nome · WhatsApp · plano de interesse · origem · quando. Ação principal: **Converter em cliente**, que abre o cadastro pré-preenchido.

---

## Regras de interação

- **Ação destrutiva pede confirmação** — cancelar cobrança, desconectar canal, anonimizar cliente. Diálogo nomeia o que será afetado, não "Tem certeza?".
- **Ação em massa acima de 100 mensagens exige digitar o número.** Trava de produto: "Digite 247 para confirmar."
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
