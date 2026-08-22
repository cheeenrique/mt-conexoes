'use server';

import { revalidatePath } from 'next/cache';
import type { ChannelProvider } from '@prisma/client';
import { beginChannelPairingSchema, saveChannelCredentialsSchema, sendManualMessagesSchema } from './schema';
import { saveAndTestChannel, testChannelConnection, setSendingChannel, type ChannelTestResult } from './service';
import {
  beginChannelPairing,
  refreshChannelPairing,
  unpairChannel,
  type PairingChallengeDTO,
} from './pairing.service';
import { sendManualBatch, type DispatchSummary } from './dispatch';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionError = { error: { code: string; message: string } };
type ActionResult = { ok: true } | ActionError;

// Erro inesperado nunca vaza stack nem credencial para a tela — o log fica no stdout.
function toActionError(err: unknown, route: string): ActionError {
  if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
  logger.error({ route, error: String(err), stack: err instanceof Error ? err.stack : undefined });
  return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
}

export async function saveAndTestChannelAction(input: unknown): Promise<ChannelTestResult | ActionError> {
  try {
    await requireSession();
    const parsed = saveChannelCredentialsSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }
    const result = await saveAndTestChannel(parsed.data);
    revalidatePath('/settings');
    return result;
  } catch (err) {
    return toActionError(err, 'messaging.saveAndTestChannel');
  }
}

export async function testChannelConnectionAction(provider: ChannelProvider): Promise<ChannelTestResult | ActionError> {
  try {
    await requireSession();
    const result = await testChannelConnection(provider);
    revalidatePath('/settings');
    return result;
  } catch (err) {
    return toActionError(err, 'messaging.testConnection');
  }
}

export async function setSendingChannelAction(provider: ChannelProvider): Promise<ActionResult> {
  try {
    await requireSession();
    await setSendingChannel(provider);
    revalidatePath('/settings');
    return { ok: true as const };
  } catch (err) {
    return toActionError(err, 'messaging.useChannel');
  }
}

/**
 * ⚠️ O desafio devolvido aqui não é gravado em lugar nenhum e não entra em log: vai direto
 * para a prop do diálogo e morre com ele. QR do WhatsApp expira em menos de um minuto.
 */
export async function beginChannelPairingAction(input: unknown): Promise<PairingChallengeDTO | ActionError> {
  try {
    await requireSession();
    const parsed = beginChannelPairingSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }
    const challenge = await beginChannelPairing(parsed.data);
    revalidatePath('/settings');
    return challenge;
  } catch (err) {
    return toActionError(err, 'messaging.beginPairing');
  }
}

export async function refreshChannelPairingAction(provider: ChannelProvider): Promise<PairingChallengeDTO | ActionError> {
  try {
    await requireSession();
    const challenge = await refreshChannelPairing(provider);
    revalidatePath('/settings');
    return challenge;
  } catch (err) {
    return toActionError(err, 'messaging.refreshPairing');
  }
}

export async function unpairChannelAction(provider: ChannelProvider): Promise<ActionResult> {
  try {
    await requireSession();
    await unpairChannel(provider);
    revalidatePath('/settings');
    return { ok: true as const };
  } catch (err) {
    return toActionError(err, 'messaging.unpairChannel');
  }
}

export async function sendManualMessagesAction(input: unknown): Promise<{ ok: true; summary: DispatchSummary } | ActionError> {
  try {
    await requireSession();
    const parsed = sendManualMessagesSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }
    const summary = await sendManualBatch({ ...parsed.data, now: new Date() });
    revalidatePath('/customers');
    return { ok: true as const, summary };
  } catch (err) {
    return toActionError(err, 'messaging.sendManual');
  }
}
