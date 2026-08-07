import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type CryptoPurpose = 'subscription.accessPassword' | 'channel.credentials';

function getKey(): Buffer {
  const raw = process.env.CREDENTIAL_KEY;
  if (!raw) throw new Error('CREDENTIAL_KEY não definido');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('CREDENTIAL_KEY deve ter 32 bytes em base64');
  return key;
}

const KEY = getKey();

/** Formato: v1:<iv>:<ciphertext>:<tag>, tudo em base64. */
export function encrypt(plain: string, purpose: CryptoPurpose): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  cipher.setAAD(Buffer.from(purpose));
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), ciphertext.toString('base64'), tag.toString('base64')].join(':');
}

export function decrypt(payload: string, purpose: CryptoPurpose): string {
  const [version, ivB64, ciphertextB64, tagB64] = payload.split(':');
  if (version !== 'v1' || !ivB64 || !ciphertextB64 || !tagB64) {
    throw new Error('Payload de criptografia com formato inválido');
  }
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}
