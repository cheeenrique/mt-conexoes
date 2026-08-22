import { describe, expect, it } from 'vitest';
import { redactSecrets } from './redact';
import { resolveDescriptor } from './registry';

const evolution = resolveDescriptor('EVOLUTION');

describe('redactSecrets', () => {
  it('apaga a chave de API ecoada pelo provider na mensagem de erro', () => {
    const credentials = { baseUrl: 'https://evo.exemplo.com', instanceName: 'mt', apiKey: 'SEGREDO-DA-API', webhookToken: 'token-do-webhook' };

    const result = redactSecrets('401 Unauthorized: apikey SEGREDO-DA-API inválida', credentials, evolution);

    expect(result).not.toContain('SEGREDO-DA-API');
    expect(result).toContain('401 Unauthorized');
  });

  it('preserva identificador público — é o que permite diagnosticar', () => {
    const credentials = { baseUrl: 'https://evo.exemplo.com', instanceName: 'mt', apiKey: 'SEGREDO-DA-API', webhookToken: 'token-do-webhook' };

    const result = redactSecrets('Instância mt não encontrada em https://evo.exemplo.com', credentials, evolution);

    expect(result).toBe('Instância mt não encontrada em https://evo.exemplo.com');
  });

  it('corta mensagem longa demais em vez de despejar o corpo da resposta na tela', () => {
    const result = redactSecrets('x'.repeat(1000), {}, evolution);

    expect(result.length).toBeLessThanOrEqual(241);
    expect(result.endsWith('…')).toBe(true);
  });

  it('não quebra quando a credencial não é objeto', () => {
    expect(redactSecrets('falha', null, evolution)).toBe('falha');
  });
});
