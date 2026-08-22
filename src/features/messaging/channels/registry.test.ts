import { describe, expect, it } from 'vitest';
import { CHANNEL_PROVIDERS, resolveAdapter } from './registry';
import { UnsupportedChannelError } from './types';

describe('resolveAdapter', () => {
  it('resolve o adapter certo pra cada provider', () => {
    expect(resolveAdapter('META_CLOUD').provider).toBe('META_CLOUD');
    expect(resolveAdapter('EVOLUTION').provider).toBe('EVOLUTION');
  });

  /**
   * `SALVY` continua no enum do Postgres — remover valor de enum é migration destrutiva por
   * benefício zero. Sem adapter, uma linha antiga em `channel_configs` falha alto em vez de
   * devolver `undefined` para dentro do despacho.
   */
  it('recusa provider sem adapter em vez de devolver undefined', () => {
    expect(CHANNEL_PROVIDERS).not.toContain('SALVY');
    expect(() => resolveAdapter('SALVY')).toThrow(UnsupportedChannelError);
  });
});
