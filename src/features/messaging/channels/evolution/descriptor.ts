import type { ChannelDescriptor } from '../types';

const SERVER_FIELDS = [
  {
    name: 'baseUrl',
    label: 'Endereço da instância',
    placeholder: 'https://evolution.seudominio.com.br',
    help: 'URL onde a Evolution API responde, sem barra no fim.',
    secret: false,
  },
  {
    name: 'apiKey',
    label: 'Chave de API',
    placeholder: 'B6D711FCDE4D4FD5936544120E713976',
    help: 'O valor de AUTHENTICATION_API_KEY no .env do seu servidor Evolution. Fica criptografado no banco.',
    secret: true,
  },
] as const;

/**
 * Dois caminhos, lado a lado.
 *
 * `qr` é o recomendado: o painel cria a instância na sua Evolution já com as opções
 * que só dá pra escolher no momento da criação (ignorar grupo, recusar ligação, não
 * puxar histórico) e com o webhook apontado pra cá — e devolve o QR pra ler no celular.
 * Nome da instância e token do webhook são gerados pelo painel; não há o que digitar.
 *
 * `manual` existe para quem já tem instância pareada por fora (Evolution Manager, curl)
 * e não quer parear de novo.
 */
export const evolutionDescriptor: ChannelDescriptor = {
  label: 'Evolution API',
  typeLabel: 'Canal não oficial, no seu servidor',
  warning: {
    text: 'Roda num servidor seu e viola os Termos de Uso do WhatsApp. Banimento do número é questão de quando, não de se. O servidor e o número são de sua responsabilidade.',
    requiresAcceptance: true,
  },
  connectionMethods: [
    {
      kind: 'PAIRING',
      id: 'qr',
      label: 'Ler o QR Code aqui',
      recommended: true,
      requirements: [
        'A Evolution API rodando numa VPS sua, alcançável por HTTPS — ela mantém a sessão aberta e não roda em servidor que escala a zero.',
        'A chave AUTHENTICATION_API_KEY do .env desse servidor.',
        'O celular do número que vai cobrar, com o WhatsApp aberto, na mão.',
      ],
      setupSteps: [
        'Informe o endereço do servidor, a chave de API e o número que vai enviar.',
        'O painel cria a instância já ignorando grupos, recusando ligações e sem puxar seu histórico de conversas.',
        'Leia o QR Code no WhatsApp do celular, em Aparelhos conectados › Conectar aparelho.',
        'Sem a câmera à mão, use o código de 8 caracteres em Conectar com número de telefone.',
      ],
      credentialFields: [
        ...SERVER_FIELDS,
        {
          name: 'pairingNumber',
          label: 'Número que vai enviar',
          placeholder: '+5565999998888',
          help: 'O número do WhatsApp que vai parear, com +55. É ele que aparece para o cliente e é o que libera o código de 8 caracteres.',
          secret: false,
          mono: true,
        },
      ],
    },
    {
      kind: 'CREDENTIALS',
      id: 'manual',
      label: 'Já tenho uma instância pareada',
      recommended: false,
      requirements: [
        'Uma instância Evolution já criada e com o WhatsApp pareado (state "open").',
        'O nome exato dessa instância e a chave de API do servidor.',
        'Acesso para configurar o webhook dela — sem isso o "PARE" do cliente não chega ao painel.',
      ],
      setupSteps: [
        'Escolha um valor para o token do webhook e informe-o abaixo — é o que impede alguém de postar resposta falsa em nome do cliente.',
        'Configure esse mesmo valor em webhook.headers.apikey da instância, apontando a URL para /api/webhooks/evolution deste painel. Ver infra/evolution/README.md.',
        'Sem webhook.headers, o evento chega sem o header, o painel recusa com 401 e o opt-out fica desligado em silêncio.',
        'O apikey que a Evolution manda no corpo de cada evento não é este token — é um identificador interno da instância. Só o header é conferido.',
      ],
      credentialFields: [
        ...SERVER_FIELDS,
        {
          name: 'instanceName',
          label: 'Nome da instância',
          placeholder: 'mt-conexoes',
          help: 'O nome que você deu à instância ao criá-la no seu servidor Evolution.',
          secret: false,
        },
        {
          name: 'webhookToken',
          label: 'Token do webhook',
          placeholder: 'um-segredo-so-seu',
          help: 'Você escolhe o valor e repete em webhook.headers.apikey da instância. Fica criptografado no banco.',
          secret: true,
        },
      ],
    },
  ],
};
