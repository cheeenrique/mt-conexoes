import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SettingsFormValues } from '../schema';

// América/Cuiabá primeiro: é o fuso do cliente (produto "MT Conexões",
// Mato Grosso) — handoff `telas/11-ajustes.md` §Identificação.
const TIMEZONE_OPTIONS = [
  { value: 'America/Cuiaba', label: 'América/Cuiabá' },
  { value: 'America/Sao_Paulo', label: 'América/São Paulo' },
  { value: 'America/Manaus', label: 'América/Manaus' },
  { value: 'America/Rio_Branco', label: 'América/Rio Branco' },
];

export function IdentificationSection({
  register,
  errors,
}: {
  register: UseFormRegister<SettingsFormValues>;
  errors: FieldErrors<SettingsFormValues>;
}) {
  return (
    <section className="rounded border border-border bg-surface p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-foreground-muted">Identificação</h2>
      <p className="mb-3 text-xs text-foreground-muted">O nome aparece na assinatura de toda mensagem enviada.</p>
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="businessName">Nome do negócio</Label>
          <Input id="businessName" aria-invalid={!!errors.businessName} {...register('businessName')} className="h-11" />
          {errors.businessName && <p className="mt-1 text-sm text-danger">{errors.businessName.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="timezone">Fuso horário</Label>
          <select
            id="timezone"
            {...register('timezone')}
            className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground"
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
