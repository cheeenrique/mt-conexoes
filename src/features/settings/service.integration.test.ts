import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { setSendingPaused } from './service';

afterEach(async () => {
  await db.settings.update({ where: { id: 'singleton' }, data: { sendingPaused: false } });
});

// O efeito do kill switch sobre o despacho (T8: mensagem PENDING intocada, contadores
// zerados) é responsabilidade de `dispatchPendingMessages` — coberto em
// `features/messaging/scheduled-dispatch.integration.test.ts`. Testar aqui de novo
// duplicaria a asserção e faria `settings` importar de `messaging`, o que a matriz de
// `.claude/rules/01-arquitetura.md` proíbe (feature não importa feature).
describe('setSendingPaused (T8)', () => {
  it('persiste true e false em Settings.sendingPaused', async () => {
    await setSendingPaused(true);
    expect((await db.settings.findUniqueOrThrow({ where: { id: 'singleton' } })).sendingPaused).toBe(true);

    await setSendingPaused(false);
    expect((await db.settings.findUniqueOrThrow({ where: { id: 'singleton' } })).sendingPaused).toBe(false);
  });
});
