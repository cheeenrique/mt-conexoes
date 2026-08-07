import { describe, expect, it, vi } from 'vitest';

describe('crypto', () => {
  it('encripta e decripta a mesma string (ida e volta)', async () => {
    vi.resetModules();
    process.env.CREDENTIAL_KEY = Buffer.alloc(32, 1).toString('base64');
    const { encrypt, decrypt } = await import('./crypto');
    const ciphertext = encrypt('senha-secreta-123', 'subscription.accessPassword');
    expect(ciphertext).not.toBe('senha-secreta-123');
    expect(decrypt(ciphertext, 'subscription.accessPassword')).toBe('senha-secreta-123');
  });

  it('falha explicitamente com finalidade (AAD) errada', async () => {
    vi.resetModules();
    process.env.CREDENTIAL_KEY = Buffer.alloc(32, 1).toString('base64');
    const { encrypt, decrypt } = await import('./crypto');
    const ciphertext = encrypt('valor', 'subscription.accessPassword');
    expect(() => decrypt(ciphertext, 'channel.credentials')).toThrow();
  });

  it('falha explicitamente com chave errada', async () => {
    vi.resetModules();
    process.env.CREDENTIAL_KEY = Buffer.alloc(32, 1).toString('base64');
    const { encrypt } = await import('./crypto');
    const ciphertext = encrypt('valor', 'channel.credentials');

    vi.resetModules();
    process.env.CREDENTIAL_KEY = Buffer.alloc(32, 2).toString('base64');
    const { decrypt } = await import('./crypto');
    expect(() => decrypt(ciphertext, 'channel.credentials')).toThrow();
  });

  it('lança erro claro se CREDENTIAL_KEY não tem 32 bytes', async () => {
    vi.resetModules();
    process.env.CREDENTIAL_KEY = Buffer.alloc(16).toString('base64');
    await expect(import('./crypto')).rejects.toThrow('CREDENTIAL_KEY deve ter 32 bytes em base64');
  });
});
