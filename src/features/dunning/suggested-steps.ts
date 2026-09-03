/**
 * A sequência sugerida oferecida no drawer "Nova régua" — D-5, D-2, D0, D+1,
 * D+3 e suspensão em D+5 (`docs/projeto/tecnico/06-regua-e-canais.md`
 * §"Régua padrão entregue").
 *
 * O modelo é pré-pago: a ênfase fica antes do vencimento, porque o acesso vai
 * acabar e o cliente age para não perder. Régua de pós-pago carregaria a mão
 * depois.
 *
 * ⚠️ `prisma/seed.ts` mantém a mesma lista para a régua padrão de dev. Mudou o
 * texto aqui, mudar lá — ou promover esta constante para o seed.
 */
export const SUGGESTED_STEPS: {
  offsetDays: number;
  action: 'SEND_MESSAGE' | 'SUSPEND';
  templateBody: string | null;
}[] = [
  {
    offsetDays: -5,
    action: 'SEND_MESSAGE',
    templateBody:
      'Olá {{cliente.primeiro_nome}}! Sua renovação de *{{cobranca.valor}}* vence em breve, dia *{{cobranca.vencimento}}*.\n\n{{negocio.nome}}',
  },
  {
    offsetDays: -2,
    action: 'SEND_MESSAGE',
    templateBody:
      'Olá {{cliente.primeiro_nome}}! Sua renovação de *{{cobranca.valor}}* vence dia *{{cobranca.vencimento}}*.\n\nPix: *{{pix.chave}}*\n\n{{negocio.nome}}',
  },
  {
    offsetDays: 0,
    action: 'SEND_MESSAGE',
    templateBody:
      'Olá {{cliente.primeiro_nome}}! Sua renovação de *{{cobranca.valor}}* vence hoje (*{{cobranca.vencimento}}*).\n\nPix: *{{pix.chave}}*\n\nQualquer dúvida, é só responder aqui.\n{{negocio.nome}}',
  },
  {
    offsetDays: 1,
    action: 'SEND_MESSAGE',
    templateBody:
      'Olá {{cliente.primeiro_nome}}, sua renovação de *{{cobranca.valor}}* está {{cobranca.dias_atraso}} dia(s) atrasada.\n\nPix: *{{pix.chave}}*\n\n{{negocio.nome}}',
  },
  {
    offsetDays: 3,
    action: 'SEND_MESSAGE',
    templateBody:
      'Olá {{cliente.primeiro_nome}}, último aviso: sua renovação de *{{cobranca.valor}}* está {{cobranca.dias_atraso}} dia(s) atrasada e o acesso pode ser suspenso.\n\nPix: *{{pix.chave}}*\n\n{{negocio.nome}}',
  },
  { offsetDays: 5, action: 'SUSPEND', templateBody: null },
];
