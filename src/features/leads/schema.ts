import { z } from 'zod';
import { normalizeBrazilPhone } from './phone';

/**
 * ⚠️ Tetos de tamanho espelham os `CHECK` da migration
 * `00000000000012_leads`. Mudou um, muda o outro — o Zod protege a borda, o
 * `CHECK` protege o banco de um bug no Zod.
 */
export const LEAD_FIELD_MAX = {
  name: 120,
  phone: 20,
  city: 80,
  interestPlan: 60,
  source: 60,
  campaign: 80,
  landingPath: 200,
  note: 500,
} as const;

const phoneField = z
  .string()
  .max(LEAD_FIELD_MAX.phone, 'Telefone inválido.')
  .transform((value, ctx) => {
    const e164 = normalizeBrazilPhone(value);
    if (!e164) {
      ctx.addIssue({ code: 'custom', message: 'Informe um WhatsApp brasileiro com DDD.' });
      return z.NEVER;
    }
    return e164;
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

/**
 * Entrada do endpoint público `POST /api/leads`.
 *
 * ⚠️ `.strict()` é requisito de segurança, não estilo: sem ele um campo
 * extra do site (ou de um bot) passa calado pela validação e chega no
 * service, onde um `...input` futuro o escreveria no banco.
 */
export const leadIntakeSchema = z
  .object({
    name: z.string().trim().min(1, 'Informe o nome.').max(LEAD_FIELD_MAX.name),
    phone: phoneField,
    city: optionalText(LEAD_FIELD_MAX.city),
    interestPlan: optionalText(LEAD_FIELD_MAX.interestPlan),
    // Bloco do site que gerou o lead (`data-cta`). Preservado como veio —
    // normalizar para "Site" apaga a única resposta para "qual seção converte".
    source: z.string().trim().min(1).max(LEAD_FIELD_MAX.source),
    campaign: optionalText(LEAD_FIELD_MAX.campaign),
    landingPath: optionalText(LEAD_FIELD_MAX.landingPath),
    // ⚠️ Não existe campo de texto livre aqui. `note` é escrito só pelo
    // painel: um campo de 500 caracteres aberto ao público é veículo de spam
    // e de conteúdo hostil dentro da tela do operador, e o formulário do site
    // (08-site.md) não tem esse campo. `.strict()` recusa se alguém mandar.
    // Cloudflare Turnstile. Opcional no schema porque a validação de verdade
    // é no servidor (`verifyTurnstile`) e só liga quando há chave configurada.
    turnstileToken: z.string().max(2048).optional(),
  })
  .strict();

export type LeadIntakeInput = z.infer<typeof leadIntakeSchema>;

/** Lead que não veio do site — indicação, ligação, grupo. */
export const manualLeadSchema = z
  .object({
    name: z.string().trim().min(1, 'Informe o nome.').max(LEAD_FIELD_MAX.name),
    phone: phoneField,
    interestPlan: optionalText(LEAD_FIELD_MAX.interestPlan),
    source: z.string().trim().min(1, 'Informe a origem.').max(LEAD_FIELD_MAX.source),
    note: optionalText(LEAD_FIELD_MAX.note),
  })
  .strict();

/**
 * Conversão do lead em cliente (handoff `telas/08-leads.md` §"Converter em
 * cliente"): o drawer abre já preenchido com nome, WhatsApp, o plano do
 * interesse e o fornecedor do plano, e ao salvar nasce **cliente +
 * assinatura**, não só cliente.
 *
 * Os campos de assinatura são primitivos de propósito — `features/leads` não
 * importa nada de `features/subscriptions`. Quem traduz este payload para os
 * três services é a Server Action de `app/(app)/leads/`, a única camada
 * autorizada a cruzar features (`.claude/rules/01-arquitetura.md`).
 */
export const convertLeadSchema = z
  .object({
    leadId: z.uuid('Lead inválido.'),
    name: z.string().trim().min(1, 'Informe o nome do cliente.').max(LEAD_FIELD_MAX.name),
    phone: phoneField,
    notes: z.string().max(2000).optional(),

    planId: z.uuid('Plano inválido.').optional().or(z.literal('')),
    supplierId: z.uuid('Fornecedor inválido.').optional().or(z.literal('')),
    // ⚠️ Valor obrigatório e maior que zero: a assinatura criada aqui emite a
    // primeira cobrança no mesmo commit. Converter com R$ 0,00 geraria uma
    // cobrança de zero real que o operador só descobre na lista.
    priceCents: z
      .string()
      .regex(/^\d+$/, 'Valor cobrado inválido.')
      .refine((value) => BigInt(value) > 0n, 'Informe o valor cobrado por ciclo.'),
    costCents: z.string().regex(/^\d+$/, 'Custo inválido.'),
    cycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'], { error: 'Selecione um ciclo válido.' }),
    screens: z.coerce.number().int().min(1, 'Mínimo 1 tela.'),
  })
  .strict();

export type ConvertLeadFormInput = z.input<typeof convertLeadSchema>;
export type ConvertLeadInput = z.output<typeof convertLeadSchema>;

export const leadStatusSchema = z.enum(['NEW', 'CONTACTED', 'CONVERTED', 'DISCARDED'], {
  error: 'Selecione uma situação válida.',
});

export const setLeadStatusSchema = z
  .object({
    leadId: z.uuid('Lead inválido.'),
    // `CONVERTED` sai de fora de propósito: converter exige criar ou apontar
    // um cliente, e o `CHECK` do banco recusa um lead convertido sem
    // `customerId`. Marcar a situação na mão pularia essa etapa.
    status: z.enum(['NEW', 'CONTACTED', 'DISCARDED'], { error: 'Selecione uma situação válida.' }),
  })
  .strict();
