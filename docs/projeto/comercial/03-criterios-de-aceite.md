# Critérios de aceite — Sistema de gestão e site de captação

> Documento de conferência da entrega. Cada linha é algo que **você testa na tela** e marca
> como aceito ou recusado. Não há item que dependa de opinião: ou o número bate, ou não bate.
>
> Versão de 25/08/2026.

## Como usar

Percorra as seções na ordem. Cada critério traz **como conferir** — o caminho na tela e o
resultado esperado. Marque a coluna final.

Um critério recusado não trava os outros: anote o que viu (tela, valor esperado, valor
mostrado) e siga. A correção do que foi recusado entra antes do aceite final.

A conferência acontece **com a sua base real já importada**. Base de teste não serve para
aceitar: o que importa é o seu cliente, o seu valor e o seu fornecedor aparecendo certos.

---

## A. Cadastro e base

| # | Critério | Como conferir | Aceito |
|---|---|---|---|
| A1 | Sua base está dentro do sistema | Abra Clientes e compare a contagem com a sua planilha | ☐ |
| A2 | Cinco clientes que você conhece de cor batem | Escolha cinco, abra a ficha de cada um: nome, telefone, plano, valor e vencimento iguais aos da planilha | ☐ |
| A3 | O relatório de importação explica o que ficou de fora | Peça o arquivo de relatório: mostra quantas linhas entraram, quantas já existiam e quais foram recusadas, com o motivo | ☐ |
| A4 | Cadastrar cliente novo funciona | Clientes → novo cliente com nome e telefone → aparece na lista | ☐ |
| A5 | Telefone repetido é recusado com aviso claro | Tente cadastrar um telefone que já existe → mensagem em português dizendo o que houve, não erro técnico | ☐ |
| A6 | Fornecedor e plano têm custo padrão | Fornecedores e Planos → cadastre um de cada com custo → o custo aparece sozinho ao criar assinatura | ☐ |
| A7 | Assinatura guarda plano, fornecedor, valor, custo e ciclo | Ficha do cliente → nova assinatura com os cinco campos → salvos e visíveis | ☐ |
| A8 | Ciclos mensal, trimestral, semestral e anual existem | Crie uma de cada e confira o vencimento resultante | ☐ |
| A9 | Busca encontra por nome, telefone e usuário de acesso | Busque pelos três → resultado coerente em cada um | ☐ |

---

## B. Cobrança e pagamento

| # | Critério | Como conferir | Aceito |
|---|---|---|---|
| B1 | Criar assinatura já gera a primeira cobrança | Nova assinatura → Cobranças mostra uma em aberto para esse cliente | ☐ |
| B2 | Painel mostra quem vence hoje, em breve e em atraso | Tela inicial → os três grupos, com as vencidas em destaque | ☐ |
| B3 | Baixa de pagamento total fecha a cobrança | Cobranças → registrar pagamento com o valor cheio → status vira Paga, com a data | ☐ |
| B4 | Pagamento total gera a próxima cobrança | Logo após B3 → nasce a cobrança do ciclo seguinte | ☐ |
| B5 | **A próxima vence contando do dia em que o cliente pagou** | Se ele pagou dia 05, a próxima mensal vence dia 05 do mês que vem — não no dia do vencimento anterior | ☐ |
| B6 | Pagamento parcial não gera cobrança nova | Registre valor menor que o total → status vira Parcial e nenhuma cobrança nasce | ☐ |
| B7 | Dois pagamentos parciais que somam o total fecham a cobrança | Complete o valor → vira Paga e só então nasce a próxima | ☐ |
| B8 | Clicar duas vezes em registrar não cobra duas vezes | Dê dois cliques rápidos no botão → um único pagamento gravado | ☐ |
| B9 | Cancelar cobrança pede confirmação | Cancele uma em aberto → diálogo nomeia o que será cancelado | ☐ |
| B10 | Cobrança com pagamento não pode ser cancelada nem editada | Tente cancelar uma já paga → recusa com explicação em português | ☐ |
| B11 | Cobrança vencida vira atrasada sozinha | No dia seguinte ao vencimento, a cobrança aparece como Em atraso sem ninguém mexer | ☐ |
| B12 | Filtro de cobranças funciona e é compartilhável | Filtre por situação e período → copie o endereço da página e abra de novo: o filtro volta igual | ☐ |

---

## C. Dinheiro e datas

Esta seção existe porque é onde erro custa confiança. Confira contra a sua planilha.

| # | Critério | Como conferir | Aceito |
|---|---|---|---|
| C1 | Todo valor aparece como `R$ 1.234,56` | Percorra as telas → nenhuma mostra número cru ou com mais de duas casas | ☐ |
| C2 | Desconto aplicado dá o valor que você esperava | Assinatura com desconto → o valor final bate com a sua conta na mão | ☐ |
| C3 | Fim de mês não inventa dia | Cliente que pagou 31/01 numa mensal → a próxima vence 28/02, não dá erro | ☐ |
| C4 | Ano bissexto é respeitado | Mesmo teste em ano bissexto → 29/02 | ☐ |
| C5 | Valor de cobrança já emitida não muda quando o fornecedor sobe o preço | Suba o custo de um fornecedor → abra uma cobrança antiga: o custo dela continua o de antes | ☐ |
| C6 | Relatório do mês fecha com a soma dos clientes | Relatórios → o lucro total do mês é igual à soma dos lucros por cliente | ☐ |
| C7 | Data aparece no fuso do seu negócio | Vencimento marcado para hoje aparece como hoje, não como ontem ou amanhã | ☐ |

---

## D. Mensagens e canais

| # | Critério | Como conferir | Aceito |
|---|---|---|---|
| D1 | Você conecta o canal sozinho, pela tela | Ajustes → Canais → conectar, seguindo os passos mostrados | ☐ |
| D2 | O canal não oficial mostra o risco antes de conectar | Ao escolher o canal não oficial → aviso de risco de banimento com aceite obrigatório | ☐ |
| D3 | Teste de conexão diz se funcionou | Botão de testar → resposta clara de sucesso ou falha, em português | ☐ |
| D4 | Nenhuma credencial de canal volta para a tela | Depois de salva, a tela mostra "configurado em DD/MM" e um botão de substituir — nunca o valor | ☐ |
| D5 | **Mensagem real chega no seu WhatsApp de teste** | Envio manual para o seu próprio número → a mensagem chega, com nome e valor corretos | ☐ |
| D6 | Prévia mostra o texto exato antes de enviar | Envio manual → prévia com o texto montado, não o modelo com variáveis | ☐ |
| D7 | Envio em lote acima de 100 pede confirmação por digitação | Selecione mais de 100 → o sistema exige digitar o número para liberar | ☐ |
| D8 | A ficha do cliente mostra o histórico de mensagens | Abra a ficha → lista do que foi enviado, quando e por qual canal | ☐ |
| D9 | Cliente que responde pedindo para sair para de receber | Responda com a palavra de saída pelo WhatsApp → a ficha marca opt-out e ele não entra em envio nenhum | ☐ |

---

## E. Régua automática

| # | Critério | Como conferir | Aceito |
|---|---|---|---|
| E1 | A régua chega em modo revisão, não ligada | Réguas → a régua entregue está em revisão; nada sai enquanto estiver assim | ☐ |
| E2 | O modo revisão mostra exatamente o que sairia hoje | Réguas → prévia com cliente, cobrança e texto reais, sem enviar nada | ☐ |
| E3 | Ativar é decisão sua, na frente dessa lista | Ative na sua presença → só a partir daí começa a enviar | ☐ |
| E4 | **A cobrança vence e a mensagem sai sozinha, no horário certo** | Deixe uma cobrança vencer → a mensagem sai dentro da janela de horário configurada | ☐ |
| E5 | Fora do horário permitido, reagenda em vez de descartar | Configure uma janela curta → o que cairia fora dela sai no próximo horário válido, não some | ☐ |
| E6 | Um cliente recebe no máximo uma mensagem por dia | Cliente com duas cobranças vencidas → recebe uma mensagem só, com as duas | ☐ |
| E7 | Pagar cancela os avisos seguintes | Registre o pagamento → os passos futuros daquela cobrança são cancelados na hora | ☐ |
| E8 | O botão de pausa geral para tudo imediatamente | Acione a pausa → nenhuma mensagem sai; ela está visível na tela inicial, não escondida | ☐ |
| E9 | Cliente em opt-out não recebe, por nenhum canal | Marque opt-out e force uma avaliação → ele fica de fora | ☐ |

---

## F. Lucro e relatórios

| # | Critério | Como conferir | Aceito |
|---|---|---|---|
| F1 | Painel do mês traz faturamento, custo, lucro, margem e em aberto | Relatórios → os cinco números, sem campo vazio | ☐ |
| F2 | Lucro por cliente com receita, custo, margem e histórico | Ficha do cliente → o bloco de lucro | ☐ |
| F3 | Quebra por fornecedor e por plano | Relatórios → as duas quebras, e cada uma soma o total geral | ☐ |
| F4 | Margem negativa gera alerta | Cadastre assinatura com preço abaixo do custo → aviso na hora, no formulário | ☐ |
| F5 | Margem abaixo do seu limite gera alerta | Ajuste o limite → assinatura que cair abaixo dele é sinalizada | ☐ |
| F6 | Exportação para planilha abre corretamente no Excel | Exporte → o arquivo abre sem aviso de segurança e os valores estão nas colunas certas | ☐ |
| F7 | Subir o custo de um fornecedor oferece reajustar as assinaturas dele | Mude o custo → o sistema propõe o reajuste em lote, mostrando quem será afetado | ☐ |

---

## G. Leads e site de captação

| # | Critério | Como conferir | Aceito |
|---|---|---|---|
| G1 | O site está no ar no seu domínio | Abra o endereço → carrega | ☐ |
| G2 | As páginas combinadas existem | 8 páginas fixas, 3 páginas locais e 6 posts de blog | ☐ |
| G3 | **O formulário do site vira um lead no painel** | Preencha o formulário → o lead aparece em Leads, com a origem | ☐ |
| G4 | Se o painel estiver fora do ar, o formulário cai para o WhatsApp | Não deixa o visitante numa tela de erro | ☐ |
| G5 | Converter lead em cliente funciona em um passo | Leads → converter → vira cliente com assinatura, sem redigitar | ☐ |
| G6 | O site é indexável | Sitemap e robots publicados; Search Console verificado | ☐ |
| G7 | Velocidade verde no celular | PageSpeed Insights mobile aprovado em LCP, INP e CLS | ☐ |
| G8 | Os botões de WhatsApp já vêm com texto pronto | Clique em um → abre a conversa com a mensagem preenchida conforme a origem | ☐ |

---

## H. Dados pessoais e segurança

| # | Critério | Como conferir | Aceito |
|---|---|---|---|
| H1 | Senha de acesso do assinante aparece mascarada | Ficha → a senha aparece como pontos, nunca em texto na listagem | ☐ |
| H2 | Revelar a senha fica registrado | Clique em revelar → o valor aparece, e o sistema grava quem revelou e quando | ☐ |
| H3 | A senha some ao fechar | Feche o diálogo → o valor não fica na tela | ☐ |
| H4 | Sair da sessão protege as telas | Saia e tente abrir uma tela interna pelo histórico → volta para o login | ☐ |
| H5 | Trocar sua senha derruba as sessões antigas | Troque a senha → a senha anterior deixa de entrar | ☐ |
| H6 | Nenhuma tela mostra erro técnico | Force um erro (telefone repetido, valor inválido) → mensagem em português, sem código nem nome de tabela | ☐ |

---

## I. Operação e entrega

| # | Critério | Como conferir | Aceito |
|---|---|---|---|
| I1 | O sistema está publicado na sua conta de nuvem | Acesso pelo endereço definitivo, com o banco na sua conta | ☐ |
| I2 | As contas de nuvem, banco e canal estão no seu nome | Nenhuma cobrança recorrente cai em cartão que não seja o seu | ☐ |
| I3 | Os automáticos rodam sozinhos | Marcação de atraso, avaliação da régua e envio acontecem sem ninguém acionar | ☐ |
| I4 | Backup diário está rodando | Confirme o arquivo do dia no destino combinado | ☐ |
| I5 | **A restauração do backup foi testada na sua frente, uma vez** | Backup nunca testado não conta como backup | ☐ |
| I6 | O código-fonte foi transferido para você | Repositório no seu nome | ☐ |
| I7 | Treinamento de 2 horas, gravado | Gravação entregue junto | ☐ |
| I8 | Manual curto de emergência | Canal caiu · número banido · restaurar backup · trocar credencial · pausar envios | ☐ |

---

## Limitações conhecidas nesta data

Registradas aqui porque um documento que promete mais do que a entrega faz é pior que um
documento incompleto. Cada uma tem encaminhamento definido antes do aceite final.

| Item | Situação | Encaminhamento |
|---|---|---|
| **Canal Salvy** | Saiu do produto. A empresa deixou de servir a este uso durante o projeto | Substituído pelos outros dois canais, sem custo. Se você quiser um terceiro canal específico, é orçamento novo |
| **Canal oficial (Meta)** | A conexão e o cadastro existem; o envio pelo modelo aprovado ainda não está concluído | Não marque este canal como padrão até D5 passar por ele. O canal não oficial entrega hoje |
| **Conexão por QR** | Implementada, ainda não vista conectando com um WhatsApp real | Confirmar junto com você no aceite, item D1 |
| **Ativar régua sem descartar a revisão** | O botão não reprocessa mensagens de dias anteriores | Comportamento a definir com você: reenviar retroativo é decisão de operação, não detalhe técnico |
| **Direito de eliminação de dados** | Especificado e desenhado, ainda não implementado | Item de segurança pendente. Entra antes do aceite final da seção H |

---

## O que não é critério de aceite

Combinado desde o início, repetido aqui para não virar discussão no fim:

- **Posição no Google.** Ranquear leva de 3 a 6 meses e depende de fatores fora do controle
  de quem constrói o site. O critério é site tecnicamente correto e indexável (G6 e G7).
- **Aprovação da Meta.** A verificação de negócio é feita por eles, no prazo deles, e pode
  ser reprovada. O critério é o sistema funcionar com a credencial válida em mãos.
- **Estabilidade do canal não oficial.** Ele depende de um recurso que o WhatsApp não
  autoriza. Banimento é risco da operação, não defeito do sistema.
- **Página, post ou funcionalidade além do que está neste documento.** Orçado à parte,
  aprovado antes de começar.

---

## Dependências suas

O prazo de cada item conta a partir da entrega da dependência correspondente.

- Conta e credencial de cada canal de WhatsApp que você quiser ativar
- Conta de nuvem e de banco de dados, no seu nome
- Domínio do site, no seu nome, separado do domínio do sistema
- Textos de referência do negócio para as páginas: planos, canais, cidade e as respostas
  das perguntas frequentes
- Planilha atual da base

---

## Garantia

Começa no aceite final. Três meses, cobrindo comportamento diferente do que está descrito
neste documento.

Não cobre: mudança de política do WhatsApp, banimento de canal não oficial, alteração de
plano da hospedagem, quebra causada por terceiro, nem funcionalidade nova.

---

## Aceite

Assinado o aceite, os itens marcados acima estão entregues e a garantia passa a valer.

| | |
|---|---|
| Data da conferência | ______ / ______ / __________ |
| Itens aceitos | ______ de 75 |
| Itens recusados | ______ (listados em anexo, com a correção acordada) |
| Cliente | ______________________________________ |
| Responsável pela entrega | ______________________________________ |
