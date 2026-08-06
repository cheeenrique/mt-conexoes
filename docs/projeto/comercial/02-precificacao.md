# Termos Comerciais — Projeto Fechado

> Documento interno. Não vai para o cliente.
> Escopo de referência: recorte **B** — cadastro, vencimentos, cobrança e baixa manual, envio manual assistido, régua automática com travas, três canais de WhatsApp, painel de lucro e margem — **mais o site de captação com SEO**. ~10 semanas de desenvolvimento solo.

---

## Termos fechados

| Item | Definição |
|---|---|
| **Valor** | R$ 5.000,00 |
| **Pagamento** | 50% na assinatura · 50% na entrega final |
| **Código-fonte** | Entregue ao cliente. Sem licença, sem mensalidade, sem restrição de uso |
| **Hospedagem** | Contratada e paga pelo cliente, no nome dele |
| **Garantia** | 3 meses sobre as funcionalidades contratadas |
| **Novas funcionalidades** | R$ 150,00/hora, orçadas e aprovadas antes de começar |

Preço de amigo, decidido com a informação toda na mesa. O que segue não questiona o valor — trata do que precisa estar escrito para que R$ 5.000 continue sendo R$ 5.000 até o fim.

---

## O que protege esse valor

A R$ 5.000 por 10 semanas, a margem de erro é zero — dá cerca de R$ 12 por hora. Nada aqui é burocracia: cada item já é jeito conhecido de um projeto de amigo virar seis meses de trabalho de graça.

⚠️ **O site foi absorvido no mesmo valor.** Era o item que mais justificaria orçamento separado — site de conteúdo com SEO não tem fronteira natural, e é onde o escopo escapa. As duas travas que sustentam a decisão: **contagem de páginas fixa** e **posição em busca não é critério de pronto**. Sem as duas escritas, este item sozinho dobra o projeto.

### 1. Escopo escrito é a única defesa

**Anexe a apresentação ao contrato como definição do que está incluído**, junto com a lista de escopo no fim deste documento.

Como a apresentação não traz mais uma lista de exclusões detalhada, a fronteira passa a ser a **lista positiva**: regra combinada antes de começar, **o que não está listado como contratado é orçado a R$ 150/hora.** Não é rigidez — é o que permite dizer sim rápido para o pedido novo, em vez de negociar caso a caso e ceder porque é amigo.

Escreva a frase no contrato. Combinar de boca com amigo é como as duas coisas se perdem juntas.

### 2. Limite o tratamento da planilha

Base bagunçada de verdade consome dias — abas inconsistentes, valores em formatos diferentes, cliente duplicado, coluna que mudou de sentido no meio.

No contrato: **até 4 horas de tratamento da base incluídas; excedente a R$ 150/hora.**

Peça a planilha **antes de assinar**. Se estiver pior do que 4 horas, você descobre agora e ajusta o valor, não na semana 2.

### 3. Garantia cobre defeito, não mudança de terceiro

Os 3 meses cobrem: comportamento diferente do que foi especificado no deck.

Não cobrem: mudança de política do WhatsApp, banimento de canal não-oficial, alteração de plano da hospedagem, quebra causada por terceiro, ou funcionalidade nova.

Escreva essa distinção. Sem ela, "está na garantia" cobre tudo que der errado nos 3 meses, e nesse nicho alguma coisa vai dar errado — canal não-oficial banido é questão de quando, não de se.

### 4. Contas de terceiro no nome dele

Não crie a conta da Meta, do gateway ou do banco no seu nome nem com o seu cartão. Ele cria, ele conecta, você orienta.

Dois motivos, ambos práticos:

- **Cobrança recorrente órfã.** Conta no seu cartão vira despesa sua depois que o projeto acabar.
- **Exposição legal.** O risco R1 do `docs/01-visao-produto.md` se aplica aqui. Projeto fechado com hospedagem dele é a posição mais segura possível: você não hospeda, não opera, não intermedeia dinheiro nem mensagem, e não retém acesso à base após a entrega.

Para manter essa posição, o contrato define o objeto como ferramenta genérica de gestão de assinaturas e cobrança, e registra que o cliente responde integralmente pelo conteúdo e pela legalidade da operação dele.

### 5. LGPD durante o desenvolvimento

A base tem nome, telefone, usuário e senha de centenas de pessoas. Dado pessoal e credencial.

- Base anonimizada durante o desenvolvimento
- Dados reais importados só no ambiente final, já sob controle dele
- Sem cópia depois da entrega
- Se precisar de dado real para depurar, autorização por escrito e apagar ao terminar

---

## Escopo B — o que está contratado

Isto é a lista que vai para o anexo do contrato. Se não está aqui, é R$ 150/hora.

**Cadastro**
- Cliente: nome, telefone, e-mail, data de entrada, situação
- Assinatura: plano, fornecedor, valor cobrado, custo, ciclo (mensal, trimestral, semestral, anual), dia de vencimento
- Usuário e senha de acesso, criptografados e mascarados na tela
- Fornecedores e planos, com custo padrão
- Importação da base atual (até 4 horas de tratamento)

**Cobrança**
- Geração automática das cobranças do ciclo
- Painel de vencimentos: hoje, próximos dias, em atraso
- Baixa de pagamento manual
- Cálculo de vencimento com âncora de fim de mês e ciclos não-mensais

**Mensagens**
- Integração com os **três** canais de WhatsApp, selecionáveis na configuração:
  - Meta Cloud API (oficial)
  - Evolution API (não-oficial, exige servidor próprio do cliente)
  - Salvy
- Envio manual assistido, individual e em lote, com prévia
- Régua automática configurável, ancorada no vencimento
- Travas: horário 08:00–20:00, uma mensagem por cliente por dia, opt-out por palavra-chave, botão de pausa geral
- Timeline de mensagens na ficha do cliente

**Lucro**
- Painel por cliente: receita, custo, lucro bruto, margem, renovações, histórico
- Visão geral do mês: faturamento, custo, lucro, em aberto, margem em risco
- Quebra por fornecedor e por plano
- Alertas de margem negativa e margem abaixo do limite

**Site de captação** — aplicação separada, domínio separado
- **8 páginas fixas** — home, planos, teste, canais, como funciona, perguntas frequentes, sobre, contato
- **3 páginas locais** (cidade ou região)
- **Blog com 6 posts**
- Dados estruturados, sitemap, canonical, Open Graph, RSS
- CTA de WhatsApp com texto pré-preenchido por origem
- Formulário de contato que gera lead dentro do painel
- Analytics e Search Console configurados
- PageSpeed Insights verde em LCP, INP e CLS, no mobile

⚠️ **Página ou post além dessa contagem é R$ 150/hora.** Site de conteúdo sem teto é trabalho infinito.

⚠️ **Posição em busca não é critério de pronto.** Ranquear leva de 3 a 6 meses e depende de fatores fora do controle de quem constrói. Entrega-se um site tecnicamente correto e indexável. Esta frase precisa estar no contrato — é a expectativa que mais gera atrito neste tipo de projeto.

**Entrega**
- Publicação no ar no ambiente dele
- Treinamento de uso — 2 horas
- 3 meses de garantia sobre o acima

**Dependências do cliente** — o prazo conta a partir da entrega de cada uma:

- Conta e credencial de cada canal de WhatsApp que ele quiser ativar. Meta Cloud API exige verificação de negócio; Evolution API exige servidor próprio dele. Nenhum dos três é criado por mim nem no meu nome.
- Conta de nuvem e banco de dados, no nome dele
- **Domínio do site**, registrado no nome dele, separado do domínio do painel
- **Textos de referência do negócio** para as páginas: quais planos, quais canais, qual cidade, o que responder nas perguntas frequentes. Eu escrevo e estruturo; a informação é dele
- Planilha atual da base

---

## Nota para o cliente #2

Este valor e a entrega do código-fonte foram decididos para este caso, que é um amigo. O cliente seguinte é uma decisão nova — vale reabrir preço, licença e modelo naquela hora, sem herdar estes termos por inércia.
