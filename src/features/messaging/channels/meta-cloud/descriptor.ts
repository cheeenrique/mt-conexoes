import type { ChannelDescriptor } from '../types';

/**
 * Um caminho só: o operador cola o que já gerou no Meta for Developers. Não existe
 * pareamento por QR aqui — a Meta identifica o número pela conta comercial, não por
 * sessão no celular. Se um dia o Embedded Signup entrar, ele é **outro objeto** em
 * `connectionMethods`, e nenhum componente muda.
 */
export const metaCloudDescriptor: ChannelDescriptor = {
  label: 'Meta Cloud API',
  typeLabel: 'Canal oficial da Meta',
  warning: {
    text: 'Fora de uma conversa iniciada pelo cliente, a Meta só entrega template aprovado. Passo da régua sem template fica pulado — não vira texto livre.',
    requiresAcceptance: false,
  },
  connectionMethods: [
    {
      kind: 'CREDENTIALS',
      id: 'manual',
      label: 'Colar as credenciais do app',
      recommended: true,
      requirements: [
        'Uma conta no Meta for Developers com um app do tipo Business e o produto WhatsApp adicionado.',
        'O número que vai enviar já verificado e associado à conta comercial (WABA).',
        'Um token permanente de usuário do sistema — o token de teste de 24 horas não serve.',
      ],
      setupSteps: [
        'Abra Meta for Developers › WhatsApp › Configuração da API e copie o ID do número e o ID da WABA.',
        'Em Configurações do app › Básico, copie a chave secreta do app.',
        'Cole os quatro valores ao lado e salve — o painel testa a credencial na Meta antes de gravar.',
        'Envie os textos da régua para aprovação como template UTILITY; passo sem template aprovado fica pulado.',
      ],
      credentialFields: [
        {
          name: 'phoneNumberId',
          label: 'ID do número de telefone',
          placeholder: '109876543210987',
          help: 'Meta for Developers › WhatsApp › Configuração da API. Fica abaixo do número; não é o número.',
          secret: false,
          mono: true,
        },
        {
          name: 'wabaId',
          label: 'ID da conta comercial (WABA)',
          placeholder: '203040506070809',
          help: 'Mesma tela, campo "ID da conta do WhatsApp Business".',
          secret: false,
          mono: true,
        },
        {
          name: 'accessToken',
          label: 'Token permanente',
          placeholder: 'EAAG0ZBexemploDeTokenPermanente',
          help: 'Configurações do app › Usuários do sistema › Gerar token. O token temporário de 24 horas não serve.',
          secret: true,
        },
        {
          name: 'appSecret',
          label: 'Chave secreta do app',
          placeholder: '3f9a1c7d2e5b8a4f6c0d9e1b3a5c7d9e',
          help: 'Configurações do app › Básico › Chave secreta do app. É o que confirma que a resposta recebida veio mesmo da Meta.',
          secret: true,
        },
      ],
    },
  ],
};
