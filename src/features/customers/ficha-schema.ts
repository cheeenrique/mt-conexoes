import { z } from 'zod';

/**
 * Formulário único de ver/editar/criar cliente (handoff `telas/04-ficha-cliente.md`
 * §"Modo edição"): três cartões — Cliente, Assinatura e Acesso do assinante.
 *
 * Mora em `features/customers` pelo mesmo motivo que `ficha-types.ts`: os campos
 * são primitivos de propósito e **nada aqui importa de `features/subscriptions`**.
 * Quem traduz este payload para os dois services é a Server Action de
 * `app/(app)/customers/`, a única camada autorizada a cruzar features
 * (`.claude/rules/01-arquitetura.md` §Matriz de import).
 *
 * ⚠️ `accessPassword` só existe no sentido de ida. A senha nunca volta do
 * servidor — nem para preencher campo, nem mascarada — então campo vazio
 * significa "mantém a atual", nunca "apaga".
 */

const optional = z.string().optional().or(z.literal(''));

export const customerFichaSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do cliente.').max(120),
  // E.164 genérico — não só Brasil. `+55` continua sendo o padrão do
  // `PhoneInput`, mas o campo aceita `+` de qualquer país (limite do E.164:
  // até 15 dígitos após o código do país).
  phone: z.string().regex(/^\+\d{8,15}$/, 'Informe um WhatsApp válido, com código do país.'),
  email: z.string().email('E-mail inválido.').optional().or(z.literal('')),
  document: optional,
  notes: z.string().max(2000).optional().or(z.literal('')),

  planId: z.string().uuid('Plano inválido.').optional().or(z.literal('')),
  supplierId: z.string().uuid('Fornecedor inválido.').optional().or(z.literal('')),
  priceCents: z.string().regex(/^\d+$/, 'Valor cobrado inválido.'),
  costCents: z.string().regex(/^\d+$/, 'Custo inválido.'),
  cycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'], { error: 'Selecione um ciclo válido.' }),
  // Vazio na criação: quem calcula o primeiro vencimento é `core/dates`, a
  // partir de `startedAt + ciclo`. Preenchido, vale como correção do
  // vencimento atual — sem tocar em cobrança já emitida.
  nextDueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de vencimento inválida.').optional().or(z.literal('')),
  screens: z.number({ error: 'Informe o número de telas.' }).int().min(1, 'Mínimo 1 tela.'),
  // Só as duas situações que o operador controla. "Vence hoje" e "Em atraso"
  // são derivadas de `core/customer-situation` e não cabem em select.
  status: z.enum(['ACTIVE', 'SUSPENDED'], { error: 'Selecione uma situação válida.' }).optional().or(z.literal('')),

  accessUsername: optional,
  accessPassword: optional,
});

export type CustomerFichaFormInput = z.input<typeof customerFichaSchema>;
export type CustomerFichaFormValues = z.output<typeof customerFichaSchema>;

export const EMPTY_CUSTOMER_FICHA_FORM: CustomerFichaFormInput = {
  name: '',
  phone: '',
  email: '',
  document: '',
  notes: '',
  planId: '',
  supplierId: '',
  priceCents: '0',
  costCents: '0',
  cycle: 'MONTHLY',
  nextDueAt: '',
  screens: 1,
  status: 'ACTIVE',
  accessUsername: '',
  accessPassword: '',
};
