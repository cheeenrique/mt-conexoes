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

// Sem ele a Evolution não emite o código de 8 caracteres — só o QR. Ver `pairing.ts`.
// Extraído porque o pareamento inicial e a troca de número validam o mesmo formato,
// mas o primeiro pede endereço+chave junto e o segundo não pede nada além do número.
const pairingNumberSchema = z
  .string()
  .trim()
  .regex(/^\+55\d{10,11}$/, 'Informe o número que vai enviar no formato +5565999998888.');

/**
 * O que o operador digita para parear: só o número. Endereço do servidor e chave de API não
 * estão aqui de propósito — vêm de `EVOLUTION_BASE_URL`/`EVOLUTION_API_KEY` (a agência já
 * provisionou o servidor; pedir esses dois valores a um operador leigo era convite a erro de
 * digitação). Nome de instância e token de webhook, pela mesma razão, também não aparecem: o
 * painel gera os dois. Ver `channels/evolution/pairing.ts` §beginPairing.
 */
export const evolutionPairingInputSchema = z.object({
  pairingNumber: pairingNumberSchema,
});

export type EvolutionPairingInput = z.infer<typeof evolutionPairingInputSchema>;

/**
 * Trocar número não repete endereço nem chave — já estão salvos. É o único campo que
 * muda quando o operador troca de chip, e é o único que este schema pede.
 */
export const evolutionChangeNumberSchema = z.object({ pairingNumber: pairingNumberSchema });

export type EvolutionChangeNumberInput = z.infer<typeof evolutionChangeNumberSchema>;
