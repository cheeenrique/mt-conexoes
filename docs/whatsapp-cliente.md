# WhatsApp Business API — o que o cliente precisa fazer

Guia para enviar ao cliente. Ele executa; no fim, quatro valores entram em
**Ajustes › Canais** do painel. Leva de 1 a 3 dias, quase tudo esperando
aprovação da Meta.

---

## Antes de começar, separe

| Item | Detalhe |
|---|---|
| **Um número de celular só para o sistema** | ⚠️ Precisa estar **fora** do WhatsApp — se já usa o app (normal ou Business) nesse número, ele para de funcionar lá. Use um chip novo. Não use o número pessoal nem o de atendimento. |
| **CNPJ ativo** | Cartão CNPJ e comprovante de endereço no nome da empresa. **Só para verificar a empresa** — dá para operar sem, ver "Sem CNPJ" abaixo. |
| **Conta no Facebook** | Pessoal, com o login em mãos. É a dona de tudo. |
| **Cartão de crédito internacional** | A Meta cobra por mensagem. Sem cartão, o envio para depois das primeiras. |

O número precisa receber **SMS ou ligação** durante o cadastro.

---

## Passo 1 · Conta comercial (Meta Business)

1. Abrir [business.facebook.com](https://business.facebook.com) e entrar com o
   Facebook.
2. **Criar conta** → nome da empresa, seu nome, e-mail comercial.
3. **Configurações da empresa › Informações da empresa** → preencher razão
   social, CNPJ, endereço e telefone. Tem que bater com o cartão CNPJ.

## Passo 2 · Verificação da empresa *(opcional — pular sem CNPJ)*

**Configurações da empresa › Central de Segurança › Iniciar verificação.**

Enviar cartão CNPJ + comprovante de endereço. A Meta responde em 1 a 5 dias
úteis. Motivo nº 1 de recusa: nome ou endereço diferentes do documento.

**Sem verificar, a conta funciona** — com dois tetos:

| | Não verificada | Verificada |
|---|---|---|
| Conversas iniciadas pela empresa | **250 por 24 h** | 1.000/dia, sobe sozinho conforme a qualidade |
| Números por conta | 2 | até 20 |

Os 250 contam **conversas iniciadas**, não mensagens. A trava T7 do painel já
limita um cliente a uma mensagem de cobrança por dia, então o teto real é
"quantos assinantes têm cobrança vencendo hoje" — não o tamanho da base. Base de
algumas centenas de assinantes com vencimentos espalhados pelo mês não chega
perto de 250.

## Passo 3 · App e produto WhatsApp

1. [developers.facebook.com](https://developers.facebook.com) → **Meus apps ›
   Criar app**.
2. Tipo **Empresa (Business)**. Vincular à conta comercial do passo 1.
3. No painel do app: **Adicionar produto › WhatsApp › Configurar**.
4. A Meta cria uma **conta do WhatsApp Business (WABA)** junto. Aceitar.

## Passo 4 · Registrar o número

Em **WhatsApp › Configuração da API**:

1. **Adicionar número de telefone.**
2. Nome de exibição (aparece para quem recebe — usar o nome comercial; nome que
   não tem relação com a empresa é recusado).
3. Confirmar por SMS ou ligação.

⚠️ O número de teste que a Meta oferece de brinde **não serve** — ele só envia
para 5 números cadastrados à mão.

## Passo 5 · Token permanente

O token que aparece na tela de configuração **expira em 24 horas**. O que serve
é outro:

1. **business.facebook.com › Configurações da empresa › Usuários › Usuários do
   sistema**.
2. **Adicionar** → nome `painel`, função **Administrador**.
3. **Adicionar ativos** → selecionar o **app** e a **conta do WhatsApp (WABA)**,
   marcar **Controle total**.
4. **Gerar novo token** → escolher o app → validade **Nunca** → marcar as
   permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
5. **Copiar e guardar.** A Meta mostra uma vez só.

## Passo 6 · Os quatro valores

| Valor | Onde |
|---|---|
| **ID do número de telefone** | WhatsApp › Configuração da API, logo abaixo do número. É um número longo, **não** é o telefone. |
| **ID da conta do WhatsApp Business (WABA)** | Mesma tela, campo ao lado. |
| **Token permanente** | O do passo 5. Começa com `EAA...`. |
| **Chave secreta do app** | Configurações do app › Básico › **Mostrar** ao lado de "Chave secreta do app". |

**Onde colocar:** entrar no painel → **Ajustes › Canais › Meta Cloud API** →
colar os quatro → **Salvar**. O painel testa na Meta antes de gravar; se algum
valor estiver errado, ele avisa e não salva.

⚠️ **Não mandar esses valores por WhatsApp, e-mail ou grupo.** Quem tem o token
manda mensagem em nome da empresa. O caminho certo é o próprio cliente colar no
painel. Se precisar passar para alguém, gerenciador de senhas — e revogar
depois em Usuários do sistema.

## Passo 7 · Templates

Fora de uma conversa que o cliente final começou, a Meta **só entrega texto
pré-aprovado**. Cada mensagem da régua vira um template:

1. **business.facebook.com › Ferramentas do WhatsApp › Modelos de mensagem ›
   Criar modelo.**
2. Categoria **Utilidade** (não "Marketing" — cobra mais e aprova menos).
3. Idioma **Português (BR)**.
4. Variáveis como `{{1}}`, `{{2}}`, na ordem em que aparecem.

Exemplo:

```
Nome: renovacao_hoje
Olá {{1}}, sua assinatura vence hoje ({{2}}). Valor: R$ {{3}}.
Para renovar, é só responder esta mensagem.
```

Aprovação leva de minutos a 24 horas. Passo da régua sem template aprovado fica
**pulado** — não vira mensagem de texto solta.

---

## Sem CNPJ

O cliente não precisa de CNPJ para **operar**. Precisa para **verificar a
empresa**, e verificar só serve para passar dos 250/dia e dos 2 números. Quatro
caminhos, do mais simples ao mais caro:

### 1 · Não verificar (recomendado para começar)

Fazer os passos 1, 3, 4, 5, 6 e 7 e pular o 2. Preencher as informações da
empresa com nome e endereço da pessoa física. O cartão de crédito da cobrança
pode ser de pessoa física.

Funciona hoje, sem papelada, com o teto de 250 conversas por 24 h. Quando a base
crescer a ponto de encostar no teto, aí vale abrir MEI e verificar — sem
recomeçar nada, o número e os templates continuam os mesmos.

### 2 · Abrir MEI

MEI **é** um CNPJ: grátis, online, sai na hora em
[gov.br/empresas-e-negocios](https://www.gov.br/empresas-e-negocios/pt-br/empresa-simples-de-credito/servicos/quero-ser-mei).
Custo de manter: DAS mensal de ~R$ 76, mais declaração anual. Com o cartão CNPJ
em mãos, o passo 2 roda normalmente.

⚠️ CPF sozinho não passa na verificação da Meta — ela exige documento de pessoa
jurídica. Não adianta enviar RG ou comprovante pessoal ali.

### 3 · Entrar por um provedor (BSP)

Alguns provedores brasileiros (360dialog, Twilio, Z-API oficial e afins)
cadastram o número dentro da conta comercial **deles**, já verificada. O cliente
não apresenta CNPJ nenhum.

Custo: mensalidade do provedor por cima do que a Meta já cobra. E as credenciais
passam a ser do provedor — o painel precisaria de um adapter novo para cada um,
que não existe hoje. Só vale a pena se travar nos outros caminhos.

### 4 · Canal não oficial (Evolution)

Nenhum documento, nenhum limite da Meta, nenhum template para aprovar. É o único
caminho que **envia hoje** pelo painel.

Em troca: o número pode ser bloqueado pelo WhatsApp sem aviso nem recurso, e o
serviço precisa rodar numa VPS própria (`infra/evolution/`). Usar chip
descartável, nunca o número pessoal.

---

**Recomendação:** caminho 1 para subir agora, MEI (caminho 2) quando o volume
pedir. Caminho 4 se a decisão for começar a cobrar antes de a parte de template
do painel ficar pronta.

## Custos e limites

- Cobrança **por mensagem enviada**, em dólar, no cartão cadastrado. Template de
  utilidade é a faixa mais barata; se o cliente final respondeu nas últimas 24
  horas, a conversa não é cobrada.
- **250 conversas/dia** e no máximo 2 números até a empresa ser verificada.
  Verificada começa em 1.000/dia e sobe sozinho conforme o histórico
  (10.000 → ilimitado).
- Bloco de mensagem marcada como spam derruba a qualidade do número e o limite
  junto. Régua respeitando opt-out ("PARE") existe para isso — o painel já para
  de enviar sozinho.

## Status atual do painel

⚠️ O canal oficial da Meta **ainda não envia** pelo painel: a parte que escolhe
o template aprovado na hora do disparo não está implementada, então todo envio
por `META_CLOUD` é recusado com "Passo sem template aprovado". Os passos acima
valem — as credenciais e os templates são pré-requisito e a aprovação demora —
mas o envio de verdade depende dessa implementação. Enquanto isso, o caminho que
envia hoje é o canal não oficial (Evolution), com as ressalvas de risco de
bloqueio que ele carrega.
