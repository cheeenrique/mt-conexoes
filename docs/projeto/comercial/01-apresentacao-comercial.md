# Apresentação Comercial — Sistema de Gestão de Assinaturas

> **Uso:** conteúdo slide a slide para montar o deck no Claude Design.
> **Formato alvo:** 9 slides, PDF, leitura em 5 minutos.
> **Tom:** direto. Quem lê é operador, não desenvolvedor.

---

## Slide 1 — Capa

**Título:** Sistema de Gestão de Assinaturas

**Subtítulo:** Cadastro, cobrança automática por WhatsApp e controle de lucro por cliente.

**Rodapé:** Proposta de desenvolvimento · [seu nome] · [mês/ano]

---

## Slide 2 — O que é

**Título:** O que é

Um sistema web que substitui a planilha de controle de assinantes.

Ele guarda a sua base, sabe quem vence quando, manda a cobrança no WhatsApp sozinho e mostra quanto você lucra — por cliente e no total.

**Comparação, duas colunas:**

| Hoje | Com o sistema |
|---|---|
| Abrir a planilha e ver quem vence | O painel já abre mostrando |
| Copiar nome e valor, mandar um por um | A mensagem sai sozinha, no horário certo |
| Anotar quem pagou na planilha | Um clique dá baixa |
| Descobrir o lucro na calculadora | Lucro e margem calculados por cliente |

---

## Slide 3 — Cadastro e base

**Título:** Funcionalidades · Cadastro

- **Clientes** — nome, telefone, e-mail, data de entrada, situação
- **Assinaturas** — plano, fornecedor, valor cobrado, custo do crédito, margem calculada na hora
- **Ciclos** — mensal, trimestral, semestral ou anual, com dia de vencimento próprio por cliente
- **Usuário e senha de acesso** — guardados criptografados e mascarados na tela
- **Fornecedores e planos** — com custo padrão, para não redigitar em cada cadastro
- **Importação da base atual** — a sua planilha entra no sistema

**Destaque:** Usuário e senha ficam aqui dentro. É o que faz você fechar a planilha de vez — se o login não estivesse no sistema, você continuaria com as duas abertas.

---

## Slide 4 — Cobrança

**Título:** Funcionalidades · Cobrança

- **Painel de vencimentos** — vencem hoje, vencem essa semana, em atraso, recebido no mês
- **Geração automática** das cobranças de cada ciclo
- **Baixa de pagamento** com um clique
- **Histórico completo** por cliente: o que foi cobrado, o que foi pago, quantos dias de atraso

Exemplo do painel:

```
  Vencem hoje        8 clientes · R$   385,00
  Vencem em 3 dias  14 clientes · R$   640,00
  Em atraso         11 clientes · R$   495,00 · média 6 dias
  Recebido no mês                 R$ 11.230,00
```

---

## Slide 5 — WhatsApp

**Título:** Funcionalidades · WhatsApp

**Régua automática** — a mensagem sai sozinha, ancorada no vencimento de cada cliente:

```
   D-3            D0            D+1            D+3           D+7
    │              │             │              │             │
 lembrete     vence hoje       aviso        cobrança      último aviso
                                            + chave Pix    + suspender
```

Cada passo é configurável. Você escreve a mensagem uma vez; ela sai com o nome, o valor e a data certos de cada cliente. Pagou no D+1, os passos seguintes cancelam sozinhos.

**Envio manual assistido** — quando você prefere revisar: seleciona os clientes, vê a prévia com o texto real, dispara em lote.

**Três canais, você escolhe qual usar:**

- Meta Cloud API — oficial
- Evolution API — seu número, via servidor próprio
- Salvy

**Proteções do seu número:**

| Trava | O que faz |
|---|---|
| Horário | Nada sai fora de 08:00–20:00 |
| Uma por dia | Cliente com três cobranças vencidas recebe uma mensagem com o total |
| Opt-out | "PARE" ou "CANCELAR" bloqueia o cliente em todos os canais |
| Botão de freio | Um clique pausa todos os envios na hora |

---

## Slide 6 — Lucro

**Título:** Funcionalidades · Lucro e margem

**Por cliente:**

```
João Silva · cliente desde 03/2021 · Fornecedor: Tubarão

  Receita acumulada     R$ 2.640,00
  Custo acumulado       R$   680,00
  Lucro bruto           R$ 1.960,00        margem 74%
  Renovações                     44
```

**Geral do mês:**

```
  Faturamento       R$ 13.500,00
  Custo             R$  4.900,00
  Lucro bruto       R$  8.600,00        margem 64%
  Em aberto         R$  1.620,00     ⚠ margem em risco: R$ 590,00
```

Com quebra por fornecedor e por plano, e alertas de assinatura com margem negativa ou abaixo do limite.

**Destaque:** **Margem em risco** é o crédito que você já pagou ao fornecedor e ainda não recebeu do cliente.

---

## Slide 7 — Site de captação

**Título:** Funcionalidades · Site que traz cliente novo

Um site separado do painel, feito para aparecer no Google e virar contato.

- **8 páginas** — home, planos, teste grátis, canais, como funciona, perguntas frequentes, sobre, contato
- **3 páginas de cidade** — quem busca "[serviço] em [sua cidade]" chega em uma página feita para essa busca
- **Blog com 6 artigos** — cada um responde uma pergunta que as pessoas digitam no Google
- **Botão de WhatsApp em toda página**, com a mensagem já escrita e identificando de onde a pessoa veio
- **Formulário de contato** que cria o lead direto no painel — o contato não se perde na rolagem da conversa
- **Rápido de verdade** — o site carrega em menos de 2 segundos no celular, e isso é medido, não prometido

**Destaque:** cada botão é rastreado separadamente. Você vai saber qual página traz cliente e qual não traz — em vez de otimizar no escuro.

⚠️ **Sobre ranquear no Google:** aparecer nas primeiras posições leva de 3 a 6 meses e depende de fatores que ninguém controla. O que é entregue é o site tecnicamente correto, rápido e indexado — a base sem a qual não se ranqueia. A posição vem do tempo e do conteúdo.

---

## Slide 8 — O que o sistema não faz

**Título:** Para ficar claro desde já

| Não faz | Por quê |
|---|---|
| Não corta o acesso no painel de streaming | Suspensão é status no sistema + aviso. O corte continua sendo feito por você. |
| Não recebe o dinheiro por você | A chave Pix é sua, a conta é sua. O sistema controla, não intermedeia. |
| A baixa do pagamento é manual | Cliente paga no seu Pix, você marca no sistema. |
| Não emite nota fiscal | Domínio separado. |
| Não tem aplicativo de celular | O painel funciona no navegador do celular. |

---

## Slide 9 — Prazo e investimento

**Título:** Prazo e investimento

**Entrega em 5 etapas:**

| Etapa | O que fica pronto | Prazo |
|---|---|---|
| 1 | Cadastro, fornecedores, planos, usuário/senha, importação da base | Semana 2 |
| 2 | Painel de vencimentos, cobranças, baixa de pagamento | Semana 3 |
| 3 | Três canais de WhatsApp + envio manual assistido | Semana 5 |
| 4 | Régua automática, travas de proteção, painel de lucro e margem | Semana 7 |
| 5 | Site de captação com SEO, blog e formulário de contato | Semana 10 |

Ao final de cada etapa você usa o que ficou pronto e dá o retorno.

---

**Valor do projeto: R$ 5.000,00**

50% na assinatura · 50% na entrega final

**Incluso:** desenvolvimento do escopo acima · site com 8 páginas, 3 páginas de cidade e 6 artigos · importação da base (até 4h de tratamento da planilha) · publicação no ar · treinamento de 2 horas · **código-fonte entregue** · **3 meses de garantia** sobre as funcionalidades contratadas.

**Não incluso:** funcionalidade fora deste escopo, e página ou artigo além da contagem acima — **R$ 150,00/hora**, orçada e aprovada antes de começar.

**Custo mensal de operação, contratado no seu nome:**

| Item | Custo |
|---|---|
| Hospedagem do painel (Google Cloud Run) | R$ 0 no volume da sua base |
| Banco de dados | R$ 0 no plano inicial |
| Hospedagem do site (Cloudflare Pages) | R$ 0 |
| Domínio do site | ~R$ 40/ano |
| WhatsApp | Varia conforme o canal escolhido |

Sem mensalidade de licença. O sistema é seu.

---

## Anexo — Notas para a conversa, não para o slide

- Pergunte os números dele antes de mostrar o deck: quantos clientes, ticket médio, quanto estima de inadimplência, quanto tempo por dia. O slide 2 fica muito mais forte com os números dele.
- Objeção provável: "já existe painel de revenda que faz isso". Painel de revenda controla acesso; isso aqui controla dinheiro e mostra lucro por cliente. Ele vai continuar usando os dois.
- Os três canais dependem das contas dele. Meta exige verificação de negócio, Evolution exige servidor dele. Diga isso na reunião — é o que mais pode atrasar a etapa 3, e não está na sua mão.
- Não prometa conciliação automática. Está no slide 7 de propósito.
