import { z } from 'zod';

export const salvyCredentialsSchema = z.object({
  apiKey: z.string().min(1, 'Informe a API key.'),
});

export type SalvyCredentials = z.infer<typeof salvyCredentialsSchema>;
