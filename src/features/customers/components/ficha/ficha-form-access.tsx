'use client';

import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { DrawerSection } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { FichaField } from './ficha-field';
import type { CustomerFichaFormInput } from '../../ficha-schema';

/**
 * Cartão "Acesso do assinante" do modo edição (handoff 04).
 *
 * ⚠️ A senha **nunca** volta do servidor — nem para preencher campo, nem
 * mascarada. O campo nasce vazio sempre, e vazio significa "mantém a atual".
 * Revelar a senha atual é outra coisa: uma ação dedicada que grava
 * `CredentialReveal` antes de devolver o valor, no modo leitura.
 */
export function FichaFormAccess({
  register,
  errors,
}: {
  register: UseFormRegister<CustomerFichaFormInput>;
  errors: FieldErrors<CustomerFichaFormInput>;
}) {
  return (
    <DrawerSection label="Acesso do assinante">
      <FichaField id="ficha-access-user" label="Usuário" error={errors.accessUsername?.message}>
        <Input id="ficha-access-user" className="h-11" autoComplete="off" {...register('accessUsername')} />
      </FichaField>

      <FichaField
        id="ficha-access-pass"
        label="Nova senha (deixe vazio para manter)"
        error={errors.accessPassword?.message}
      >
        <PasswordInput id="ficha-access-pass" className="h-11" autoComplete="new-password" {...register('accessPassword')} />
      </FichaField>
    </DrawerSection>
  );
}
