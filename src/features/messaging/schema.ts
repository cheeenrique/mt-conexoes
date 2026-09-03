import { z } from 'zod';
import { metaCloudCredentialsSchema } from './channels/meta-cloud/schema';
import {
  evolutionChangeNumberSchema,
  evolutionCredentialsSchema,
  evolutionPairingInputSchema,
} from './channels/evolution/schema';

/**
 * Entrada do caminho `CREDENTIALS` de cada canal: o operador cola valores que já tem.
 * O caminho `PAIRING` tem entrada própria (`beginChannelPairingSchema`) porque pede
 * outros campos — os que o painel gera não são digitados.
 */
export const saveChannelCredentialsSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('META_CLOUD'), credentials: metaCloudCredentialsSchema }),
  z.object({
    provider: z.literal('EVOLUTION'),
    credentials: evolutionCredentialsSchema,
    riskAccepted: z.literal(true, { error: 'Confirme que está ciente do risco antes de salvar.' }),
  }),
]);

export type SaveChannelCredentialsInput = z.infer<typeof saveChannelCredentialsSchema>;

/** Entrada do caminho `PAIRING`. `methodId` casa com o `id` do método no descritor. */
export const beginChannelPairingSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('EVOLUTION'),
    methodId: z.literal('qr'),
    credentials: evolutionPairingInputSchema,
    riskAccepted: z.literal(true, { error: 'Confirme que está ciente do risco antes de conectar.' }),
  }),
]);

export type BeginChannelPairingInput = z.infer<typeof beginChannelPairingSchema>;

/**
 * Trocar número não repete endereço nem chave — já estão salvos, e a tela nunca os pede
 * de volta (`CLAUDE.md` §Segurança). Só o campo que muda quando o operador troca de chip.
 */
export const changeChannelNumberSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('EVOLUTION'), ...evolutionChangeNumberSchema.shape }),
]);

export type ChangeChannelNumberInput = z.infer<typeof changeChannelNumberSchema>;

export const sendManualMessagesSchema = z.object({
  // ⚠️ Toda regra de borda leva mensagem própria: sem ela o Zod devolve o texto
  // padrão em inglês (`Invalid UUID`), e `actions.ts` repassa o primeiro issue
  // direto para o toast do operador.
  customerIds: z.array(z.uuid('Cliente inválido.')).min(1, 'Selecione ao menos um cliente.'),
  body: z.string().min(1, 'Escreva o texto da mensagem.'),
});

export type SendManualMessagesInput = z.infer<typeof sendManualMessagesSchema>;
