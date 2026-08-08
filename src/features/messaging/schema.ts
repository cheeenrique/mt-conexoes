import { z } from 'zod';
import { metaCloudCredentialsSchema } from './channels/meta-cloud/schema';
import { evolutionCredentialsSchema } from './channels/evolution/schema';
import { salvyCredentialsSchema } from './channels/salvy/schema';

export const saveChannelCredentialsSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('META_CLOUD'), credentials: metaCloudCredentialsSchema }),
  z.object({
    provider: z.literal('EVOLUTION'),
    credentials: evolutionCredentialsSchema,
    riskAccepted: z.literal(true, { error: 'Confirme que está ciente do risco antes de salvar.' }),
  }),
  z.object({ provider: z.literal('SALVY'), credentials: salvyCredentialsSchema }),
]);

export type SaveChannelCredentialsInput = z.infer<typeof saveChannelCredentialsSchema>;
