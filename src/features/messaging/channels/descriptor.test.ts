import { describe, expect, it } from 'vitest';
import type { ChannelProvider } from '@prisma/client';
import { CHANNEL_PROVIDERS, resolveAdapter, resolveDescriptor } from './registry';
import { isPairable } from './pairing';
import type { ChannelConnectionMethod } from './types';
import { beginChannelPairingSchema, saveChannelCredentialsSchema } from '../schema';
import { metaCloudCredentialsSchema } from './meta-cloud/schema';
import { evolutionCredentialsSchema, evolutionPairingInputSchema } from './evolution/schema';

/**
 * O descritor é a fonte da forma do formulário, e agora um canal declara **mais de um**
 * caminho de conexão. Divergir do schema Zod que o adapter exige é o bug que a refatoração
 * pode introduzir, e ele deixou de ser visível no diff da tela: campo declarado num método
 * que o schema daquele método ignora (o operador digita à toa) ou campo exigido pelo schema
 * e ausente do método (não tem como conectar por aquele caminho).
 */
const SCHEMAS: Record<string, { shape: Record<string, unknown> }> = {
  'META_CLOUD:manual': metaCloudCredentialsSchema,
  'EVOLUTION:manual': evolutionCredentialsSchema,
  'EVOLUTION:qr': evolutionPairingInputSchema,
};

function methodsOf(provider: ChannelProvider): [string, ChannelConnectionMethod][] {
  return resolveDescriptor(provider).connectionMethods.map((method) => [method.id, method]);
}

function credentialsFromPlaceholders(method: ChannelConnectionMethod): Record<string, string> {
  return Object.fromEntries(method.credentialFields.map((field) => [field.name, field.placeholder]));
}

describe.each(CHANNEL_PROVIDERS)('descritor de %s', (provider) => {
  const descriptor = resolveDescriptor(provider);

  it('tem tipo, aviso e ao menos um caminho de conexão', () => {
    expect(descriptor.typeLabel).not.toBe('');
    expect(descriptor.warning.text).not.toBe('');
    expect(descriptor.connectionMethods.length).toBeGreaterThan(0);
  });

  it('não repete id de método e marca no máximo um como recomendado', () => {
    const ids = descriptor.connectionMethods.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(descriptor.connectionMethods.filter((m) => m.recommended)).toHaveLength(1);
  });

  describe.each(methodsOf(provider))('caminho %s', (methodId, method) => {
    it('declara exatamente os campos que o schema daquele caminho exige', () => {
      const declared = method.credentialFields.map((f) => f.name).sort();
      const required = Object.keys(SCHEMAS[`${provider}:${methodId}`]!.shape).sort();

      expect(declared).toEqual(required);
    });

    it('preenchido só com os placeholders, passa na validação de entrada', () => {
      const credentials = credentialsFromPlaceholders(method);
      const parsed =
        method.kind === 'PAIRING'
          ? beginChannelPairingSchema.safeParse({ provider, methodId, credentials, riskAccepted: true })
          : saveChannelCredentialsSchema.safeParse({ provider, credentials, riskAccepted: true });

      expect(parsed.success ? null : parsed.error.issues).toBeNull();
    });

    it('tem requisitos e passos para as duas metades da coluna', () => {
      expect(method.requirements.length).toBeGreaterThan(0);
      expect(method.setupSteps.length).toBeGreaterThan(0);
      expect(method.label).not.toBe('');
    });

    it('marca como segredo todo campo que não pode voltar para a tela', () => {
      const publicFields = method.credentialFields.filter((f) => !f.secret).map((f) => f.name);

      // Token, chave de API e segredo de app são secret. O que sobra público é
      // identificador: endereço, nome de instância, id de número, número remetente.
      expect(publicFields.some((name) => /token|secret|apikey/i.test(name))).toBe(false);
    });
  });
});

describe('caminho de pareamento', () => {
  /**
   * A trava que impede o descritor de prometer o que o adapter não entrega. É o único lugar
   * do sistema que consulta `isPairable()` além do service de pareamento — a tela pergunta
   * ao descritor quais caminhos existem, nunca qual é o provider.
   */
  it('todo descritor com método PAIRING tem adapter que implementa PairableChannel', () => {
    for (const provider of CHANNEL_PROVIDERS) {
      const declaresPairing = resolveDescriptor(provider).connectionMethods.some((m) => m.kind === 'PAIRING');
      if (!declaresPairing) continue;

      expect(isPairable(resolveAdapter(provider)), `${provider}: descritor promete QR e o adapter não parea`).toBe(true);
    }
  });

  it('a Meta Cloud não declara pareamento — ela identifica o número pela conta comercial', () => {
    expect(resolveDescriptor('META_CLOUD').connectionMethods.every((m) => m.kind === 'CREDENTIALS')).toBe(true);
    expect(isPairable(resolveAdapter('META_CLOUD'))).toBe(false);
  });

  it('a Evolution declara os dois caminhos, com o QR como recomendado', () => {
    const methods = resolveDescriptor('EVOLUTION').connectionMethods;

    expect(methods.map((m) => m.id)).toEqual(['qr', 'manual']);
    expect(methods.find((m) => m.recommended)?.kind).toBe('PAIRING');
  });
});
