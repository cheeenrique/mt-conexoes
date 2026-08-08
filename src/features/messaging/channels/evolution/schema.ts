import { z } from 'zod';

export const evolutionCredentialsSchema = z.object({
  baseUrl: z.string().url('Informe a URL do servidor Evolution.'),
  apiKey: z.string().min(1, 'Informe a API key.'),
  instanceName: z.string().min(1, 'Informe o nome da instância.'),
});

export type EvolutionCredentials = z.infer<typeof evolutionCredentialsSchema>;
