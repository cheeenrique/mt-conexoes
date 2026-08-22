'use server';

import { revalidatePath } from 'next/cache';
import { settingsSchema, toggleSendingPausedSchema } from './schema';
import { updateSettings, setSendingPaused } from './service';
import { requireSession } from '@/lib/auth';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };

export async function updateSettingsAction(input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await updateSettings(parsed.data);
    revalidatePath('/settings');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'settings.update', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

// Kill switch (T8) — a faixa de pausa e o botão da sidebar aparecem em toda
// tela, então a invalidação precisa alcançar o layout compartilhado, não só
// `/settings`.
export async function toggleSendingPausedAction(paused: boolean): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = toggleSendingPausedSchema.safeParse({ paused });
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: messages.common.invalidInput } };
    }

    await setSendingPaused(parsed.data.paused);
    revalidatePath('/', 'layout');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'settings.togglePause', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
