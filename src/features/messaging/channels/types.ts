import type { ChannelProvider } from '@prisma/client';
import { DomainError } from '@/lib/errors';

export class ChannelCredentialsInvalidError extends DomainError {
  constructor(cause?: unknown) {
    super('Credencial em formato inválido para este canal.', 'CHANNEL_CREDENTIALS_INVALID', { cause });
  }
}

/**
 * Provider que existe no enum do banco mas não tem mais adapter — hoje só `SALVY`,
 * removido do produto. O valor continua alcançável por linha antiga em `channel_configs`,
 * então a falha é explícita em vez de `undefined` vazando para dentro do despacho.
 */
export class UnsupportedChannelError extends DomainError {
  constructor(provider: ChannelProvider, cause?: unknown) {
    super('Este canal não está mais disponível. Escolha outro em Ajustes › Canais.', 'CHANNEL_UNSUPPORTED', { cause });
    this.provider = provider;
  }
  readonly provider: ChannelProvider;
}

export type ChannelCapabilities = {
  supportsFreeText: boolean;
  requiresApprovedTemplate: boolean;
  /** Teto do provider — `scheduled-dispatch.ts` recusa mandar corpo maior em vez
   *  de deixar o provider rejeitar ou truncar em silêncio. */
  maxBodyLength: number;
  /** Envios por minuto que o canal tolera — `core/send-throttle.ts` deriva o
   *  jitter entre envios e o tamanho do lote a partir daqui. */
  rateLimitPerMinute: number;
};

export type SendInput = {
  toPhone: string;
  body: string;
  templateRef?: { name: string; params?: Record<string, string> };
};

export type SendResult =
  | { ok: true; externalId: string }
  | { ok: false; retryable: boolean; reason: string };

export type HealthResult = { ok: true } | { ok: false; reason: string };

export type InboundMessage = { fromPhone: string; text: string };

/**
 * Estado de sessão que o próprio canal empurra por webhook — só existe onde o canal
 * mantém uma sessão para reportar (Evolution). `'open'` = conectado; `'close'` =
 * sessão caiu (WhatsApp deslogado, processo reiniciado, etc.); `'connecting'` =
 * reconexão automática em andamento, nem queda nem volta confirmada.
 */
export type ConnectionEvent = {
  state: 'open' | 'close' | 'connecting';
  /**
   * Identificador do WhatsApp que acabou de conectar, quando o canal reporta. É daqui
   * que sai `ChannelConfig.phoneNumber` — o número do remetente é o que o telefone
   * pareado diz ser, não o que o operador digitou.
   */
  phone?: string;
};

export type ChannelCredentialField = {
  /** Chave dentro de `credentials` — casa com o schema Zod do adapter. */
  name: string;
  label: string;
  /** Exemplo do formato esperado. Serve de valor de amostra no teste descritor↔schema. */
  placeholder: string;
  /** Onde o operador acha esse valor. */
  help: string;
  /** Renderiza campo de senha. */
  secret: boolean;
  /** Id, número ou código: exibe em mono com tabular-nums. */
  mono?: boolean;
};

export type ChannelWarning = {
  text: string;
  /** Exige aceite datado antes de gravar (`ChannelConfig.riskAcceptedAt`). */
  requiresAcceptance: boolean;
};

/**
 * Um caminho de conexão do canal. Existe mais de um porque conectar o mesmo canal
 * tem mais de um jeito, com requisitos e campos diferentes: a Evolution parea por QR
 * (o painel cria a instância) ou aceita uma instância que o operador já pareou na mão.
 *
 * ⚠️ A tela **não pergunta qual é o provider** — ela percorre `connectionMethods`.
 * Embedded Signup da Meta, no dia em que existir, é um objeto a mais aqui e zero
 * mudança de componente.
 */
export type ChannelConnectionMethod = {
  /**
   * `PAIRING` — o painel provisiona e devolve um desafio (QR/código) para o operador
   * escanear. Exige que o adapter implemente `PairableChannel` (ver `channels/pairing.ts`).
   * `CREDENTIALS` — o operador cola valores que já tem, e o painel só testa e grava.
   */
  kind: 'PAIRING' | 'CREDENTIALS';
  /** Estável — usado como valor de entrada da action. */
  id: string;
  label: string;
  /** Recebe o selo e a coluna da esquerda. No máximo um por canal. */
  recommended: boolean;
  /** O "Antes de conectar" **deste** caminho — o que precisa existir antes de começar. */
  requirements: string[];
  /** O que o operador faz, na ordem, depois que os requisitos estão de pé. */
  setupSteps: string[];
  /** Campos que este caminho pede. Casa com o schema Zod do adapter — ver `descriptor.test.ts`. */
  credentialFields: ChannelCredentialField[];
};

/**
 * Descritor de canal — a forma da tela de Canais, declarada pelo adapter.
 *
 * Existe porque `if (provider === 'evolution')` fora desta pasta não passa em
 * review (CLAUDE.md, §Providers de WhatsApp). Passos, campos, aviso e rótulo de
 * tipo variam por canal; a tela só percorre o descritor.
 *
 * ⚠️ O descritor descreve os campos, **nunca** carrega valor. Credencial de canal
 * não volta para o front, nem mascarada.
 */
export type ChannelDescriptor = {
  /** Nome do canal na tela. */
  label: string;
  /** "Canal oficial da Meta", "Canal não oficial, no seu servidor"... */
  typeLabel: string;
  /** O risco é do canal, não do caminho: vale para todos os `connectionMethods`. */
  warning: ChannelWarning;
  connectionMethods: ChannelConnectionMethod[];
};

export interface ChannelAdapter {
  readonly provider: ChannelProvider;
  readonly capabilities: ChannelCapabilities;
  readonly descriptor: ChannelDescriptor;
  send(input: SendInput, credentials: unknown): Promise<SendResult>;
  healthCheck(credentials: unknown): Promise<HealthResult>;
  verifyWebhookSignature(rawBody: string, headers: Headers, credentials: unknown): boolean;
  parseInboundWebhook(rawBody: string): InboundMessage[] | null;
  /**
   * Opcional: só canais com sessão própria têm estado de conexão para reportar
   * (Evolution). Meta Cloud não implementa — `undefined`, nunca um
   * `if (provider === ...)` no consumidor (`app/api/webhooks/*`, `scheduled-dispatch.ts`).
   */
  parseConnectionEvent?(rawBody: string): ConnectionEvent | null;
}
