import { z } from 'zod';

/**
 * O que fica gravado (criptografado) em `ChannelConfig.credentials`, venha o canal do
 * pareamento por QR ou de uma instância que o operador já tinha.
 *
 * `instanceName` e `webhookToken` são gerados pelo painel no caminho de QR — por isso
 * não aparecem nos campos daquele método no descritor. A forma do blob é a mesma nos
 * dois caminhos: o adapter de envio não sabe (nem precisa saber) como o canal conectou.
 */
export const evolutionCredentialsSchema = z.object({
  baseUrl: z.string().url('Informe a URL do servidor Evolution.'),
  apiKey: z.string().min(1, 'Informe a API key.'),
  instanceName: z.string().min(1, 'Informe o nome da instância.'),
  webhookToken: z.string().min(1, 'Informe o token do webhook.'),
});

export type EvolutionCredentials = z.infer<typeof evolutionCredentialsSchema>;

/**
 * O que o operador digita para parear. Nome de instância e token de webhook não estão
 * aqui de propósito: pedir ao operador um valor que o painel gera é convite a divergência.
 */
export const evolutionPairingInputSchema = z.object({
  baseUrl: z.string().url('Informe a URL do servidor Evolution.'),
  apiKey: z.string().min(1, 'Informe a API key.'),
  // Sem ele a Evolution não emite o código de 8 caracteres — só o QR. Ver `pairing.ts`.
  pairingNumber: z
    .string()
    .trim()
    .regex(/^\+55\d{10,11}$/, 'Informe o número que vai enviar no formato +5565999998888.'),
});

export type EvolutionPairingInput = z.infer<typeof evolutionPairingInputSchema>;
