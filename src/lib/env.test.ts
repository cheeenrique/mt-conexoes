import { describe, expect, it } from 'vitest';
import { requireEnv } from './env';

describe('requireEnv', () => {
  it('devolve o valor quando a env existe', () => {
    process.env.TEST_VAR = 'valor';
    expect(requireEnv('TEST_VAR')).toBe('valor');
  });

  it('lança erro explícito quando a env não existe', () => {
    delete process.env.TEST_VAR_MISSING;
    expect(() => requireEnv('TEST_VAR_MISSING')).toThrow('TEST_VAR_MISSING não definido');
  });
});
