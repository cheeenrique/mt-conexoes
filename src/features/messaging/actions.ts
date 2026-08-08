'use server';

import { revalidatePath } from 'next/cache';
import type { ChannelProvider } from '@prisma/client';
import { saveChannelCredentialsSchema } from './schema';
import { saveChannelCredentials, testChannelConnection, setChannelActive, setDefaultChannel } from './service';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };

export async function saveChannelCredentialsAction(input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = saveChannelCredentialsSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }
    await saveChannelCredentials(parsed.data);
    revalidatePath('/channels');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'messaging.saveCredentials', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function testChannelConnectionAction(provider: ChannelProvider): Promise<{ ok: boolean; reason?: string } | { error: { code: string; message: string } }> {
  try {
    await requireSession();
    const result = await testChannelConnection(provider);
    revalidatePath('/channels');
    return result;
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'messaging.testConnection', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function setChannelActiveAction(provider: ChannelProvider, active: boolean): Promise<ActionResult> {
  try {
    await requireSession();
    await setChannelActive(provider, active);
    revalidatePath('/channels');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'messaging.setActive', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function setDefaultChannelAction(provider: ChannelProvider): Promise<ActionResult> {
  try {
    await requireSession();
    await setDefaultChannel(provider);
    revalidatePath('/channels');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'messaging.setDefault', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
