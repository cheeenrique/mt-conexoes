import type { ChannelProvider } from '@prisma/client';
import { DomainError } from '@/lib/errors';

export class ChannelCredentialsInvalidError extends DomainError {
  constructor(cause?: unknown) {
    super('Credencial em formato inválido para este canal.', 'CHANNEL_CREDENTIALS_INVALID', { cause });
  }
}

export type ChannelCapabilities = {
  supportsFreeText: boolean;
  requiresApprovedTemplate: boolean;
  supportsInboundReply: boolean;
  supportsDeliveryReceipt: boolean;
  maxBodyLength: number;
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

export interface ChannelAdapter {
  readonly provider: ChannelProvider;
  readonly capabilities: ChannelCapabilities;
  send(input: SendInput, credentials: unknown): Promise<SendResult>;
  healthCheck(credentials: unknown): Promise<HealthResult>;
  verifyWebhookSignature(rawBody: string, headers: Headers, credentials: unknown): boolean;
  parseInboundWebhook(rawBody: string): InboundMessage[] | null;
}
