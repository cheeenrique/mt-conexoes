import { describe, expect, it } from 'vitest';
import { resolveAdapter } from './registry';

describe('resolveAdapter', () => {
  it('resolve o adapter certo pra cada provider', () => {
    expect(resolveAdapter('META_CLOUD').provider).toBe('META_CLOUD');
    expect(resolveAdapter('EVOLUTION').provider).toBe('EVOLUTION');
    expect(resolveAdapter('SALVY').provider).toBe('SALVY');
  });
});
