/**
 * Opções de plano e fornecedor que o drawer de conversão recebe por prop.
 * Primitivos: `features/leads` não importa DTO de `features/plans` nem de
 * `features/suppliers` — quem carrega as duas listas é `app/(app)/leads/page.tsx`.
 */

export interface ConvertPlanOption {
  id: string;
  name: string;
  cycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
  /** Centavos como string: `BigInt` não cruza para componente cliente. */
  priceCents: string;
  costCents: string;
  supplierId: string | null;
}

export interface ConvertSupplierOption {
  id: string;
  name: string;
}
