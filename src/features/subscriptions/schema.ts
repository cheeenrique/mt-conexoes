import Decimal from 'decimal.js';
import { z } from 'zod';

// Enum com `{ error }` custom perde a mensagem quando fica dentro de um
// `.or(z.literal(''))` — zod cai no "Invalid input" genérico do union nesse
// caso (verificado manualmente contra a zod 4.4 instalada). `preprocess`
// normaliza '' para undefined antes do enum validar, então a mensagem
// customizada sempre aparece.
const discountTypeField = z.preprocess(
  (val) => (val === '' ? undefined : val),
  z.enum(['PERCENT', 'FIXED'], { error: 'Selecione um tipo de desconto válido.' }).optional(),
);

// Operador digita vírgula como separador decimal (padrão pt-BR). Normaliza
// pra ponto antes da regex validar, e antes de qualquer cálculo — assim
// "10,50" e "10.50" chegam no service como o mesmo valor.
// Bound de dígitos casa com a coluna `DECIMAL(10,2)`: 8 dígitos inteiros +
// 2 decimais no máximo, senão o Prisma rejeita com erro de overflow que
// não vira mensagem em pt-BR pro usuário.
const discountValueField = z.preprocess(
  (val) => (typeof val === 'string' ? val.replace(',', '.') : val),
  z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, 'Valor de desconto inválido.').optional().or(z.literal('')),
);

export const subscriptionSchema = z
  .object({
    planId: z.string().uuid('Plano inválido.').optional().or(z.literal('')),
    supplierId: z.string().uuid('Fornecedor inválido.').optional().or(z.literal('')),
    priceCents: z.string({ error: 'Preço inválido.' }).regex(/^\d+$/, 'Preço inválido.'),
    costCents: z.string({ error: 'Custo inválido.' }).regex(/^\d+$/, 'Custo inválido.'),
    cycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'], { error: 'Selecione um ciclo válido.' }),
    discountType: discountTypeField,
    discountValue: discountValueField,
    discountUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de validade inválida.').optional().or(z.literal('')),
    accessUsername: z.string().optional(),
    accessPassword: z.string().optional(),
    accessServer: z.string().optional(),
    screens: z.number({ error: 'Informe o número de telas.' }).int().min(1, 'Mínimo 1 tela.').default(1),
    accessNotes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasType = !!data.discountType;
    const hasValue = !!data.discountValue;

    // Tipo sem valor ou valor sem tipo é dado sem sentido — um não existe
    // sem o outro no domínio de desconto.
    if (hasType && !hasValue) {
      ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Informe o valor do desconto para o tipo selecionado.' });
    }
    if (hasValue && !hasType) {
      ctx.addIssue({ code: 'custom', path: ['discountType'], message: 'Selecione o tipo do desconto informado.' });
    }
    if (hasType && hasValue && data.discountType === 'PERCENT' && Number(data.discountValue) > 100) {
      ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Desconto percentual não pode passar de 100%.' });
    }

    // FIXED é reais (DECIMAL(10,2)), priceCents é centavos — mesma conversão
    // que computeChargeDiscount faz no service. Sem este bound, um desconto
    // fixo maior que o preço passa por aqui inteiro e só estoura no banco,
    // no CHECK charges_discount_bounded, como erro genérico de Postgres na
    // tela — o service não recalcula: quando o desconto chega até lá, tem
    // que estar garantido que cabe no principal.
    if (hasType && hasValue && data.discountType === 'FIXED' && data.priceCents) {
      const discountCents = new Decimal(data.discountValue as string).times(100);
      const priceCents = new Decimal(data.priceCents);
      if (discountCents.greaterThan(priceCents)) {
        ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Desconto não pode ser maior que o preço da assinatura.' });
      }
    }
  });
