import { z } from 'zod';

export const metaCloudCredentialsSchema = z.object({
  accessToken: z.string().min(1, 'Informe o token de acesso.'),
  phoneNumberId: z.string().min(1, 'Informe o Phone Number ID.'),
  wabaId: z.string().min(1, 'Informe o WABA ID.'),
  appSecret: z.string().min(1, 'Informe o App Secret.'),
});

export type MetaCloudCredentials = z.infer<typeof metaCloudCredentialsSchema>;
