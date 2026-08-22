import { z } from 'zod';

/**
 * Dias sempre positivos + o lado do vencimento em campo próprio.
 *
 * O formulário antigo pedia um inteiro com sinal (`-5` = antes). Errar o sinal
 * não dá erro de validação nenhum: vira um passo válido no dia oposto, e a
 * cobrança sai cinco dias depois do vencimento em vez de cinco antes. Com dois
 * campos o sinal deixa de ser digitável.
 */
export const STEP_DIRECTIONS = ['before', 'after'] as const;
export type StepDirection = (typeof STEP_DIRECTIONS)[number];

export const dunningStepSchema = z.object({
  days: z.coerce
    .number({ message: 'Informe os dias em número.' })
    .int('Dias precisa ser um número inteiro.')
    .min(0, 'Use um número de dias positivo e escolha antes ou depois do vencimento.')
    .max(365, 'No máximo 365 dias de distância do vencimento.'),
  direction: z.enum(STEP_DIRECTIONS),
  action: z.enum(['SEND_MESSAGE', 'SUSPEND', 'NOTIFY_OWNER']),
  templateBody: z.string().optional(),
  isActive: z.boolean().default(true),
});

export type DunningStepInput = z.infer<typeof dunningStepSchema>;

const ruleName = z
  .string()
  .trim()
  .min(2, 'O nome da régua precisa de pelo menos 2 caracteres.')
  .max(60, 'O nome da régua tem no máximo 60 caracteres.');

export const renameDunningRuleSchema = z.object({ name: ruleName });

/** `empty` monta do zero, `suggested` usa D-5/D-2/D0/D+1/D+3 e suspensão em D+5, `copy` clona outra régua. */
export const STEP_SOURCES = ['empty', 'suggested', 'copy'] as const;
export type StepSource = (typeof STEP_SOURCES)[number];

export const createDunningRuleSchema = z
  .object({
    name: ruleName,
    stepsSource: z.enum(STEP_SOURCES).default('empty'),
    copyFromRuleId: z.string().optional(),
  })
  .refine((value) => value.stepsSource !== 'copy' || !!value.copyFromRuleId, {
    message: 'Escolha a régua de onde copiar os passos.',
    path: ['copyFromRuleId'],
  });

export type CreateDunningRuleInput = z.infer<typeof createDunningRuleSchema>;

/**
 * Só as transições que a tela oferece. `ACTIVE` a partir de `REVIEW` não entra
 * aqui de propósito: ativar exige a decisão de retroativos e passa por
 * `activateDunningRule`, na frente da lista real do que sairia.
 */
export const dunningRuleStatusSchema = z.object({
  status: z.enum(['REVIEW', 'PAUSED', 'ACTIVE']),
});
