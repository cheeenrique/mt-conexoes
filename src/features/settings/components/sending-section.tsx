import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SettingsFormValues } from '../schema';
import { HourField } from './hour-field';

function pad(hour: number): string {
  return String(hour).padStart(2, '0');
}

function sendingWindowHint(quietHourStart: number, quietHourEnd: number): string {
  const exampleHour = pad((quietHourEnd + 1) % 24);
  return (
    `Hoje, uma mensagem calculada às ${exampleHour}:30 sairia às ${pad(quietHourStart)}:00 do dia seguinte. ` +
    'O alerta de margem aparece no Início e na ficha do cliente; não bloqueia nenhuma venda.'
  );
}

export function SendingSection({
  register,
  control,
  errors,
  quietHourStart,
  quietHourEnd,
}: {
  register: UseFormRegister<SettingsFormValues>;
  control: Control<SettingsFormValues>;
  errors: FieldErrors<SettingsFormValues>;
  quietHourStart: number;
  quietHourEnd: number;
}) {
  return (
    <section className="rounded border border-border bg-surface p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-foreground-muted">Envio e alertas</h2>
      <p className="mb-3 text-xs text-foreground-muted">
        Fora da janela, a mensagem fica na fila e sai no primeiro horário permitido.
      </p>
      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="quietHourStart">Envia a partir de</Label>
            <HourField id="quietHourStart" control={control} name="quietHourStart" ariaInvalid={!!errors.quietHourStart} />
            {errors.quietHourStart && <p className="mt-1 text-sm text-danger">{errors.quietHourStart.message}</p>}
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="quietHourEnd">Para de enviar às</Label>
            <HourField id="quietHourEnd" control={control} name="quietHourEnd" ariaInvalid={!!errors.quietHourEnd} />
            {errors.quietHourEnd && <p className="mt-1 text-sm text-danger">{errors.quietHourEnd.message}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="marginAlertPercent">Alertar margem abaixo de (%)</Label>
          <Input id="marginAlertPercent" aria-invalid={!!errors.marginAlertPercent} {...register('marginAlertPercent')} className="h-11" />
          {errors.marginAlertPercent && <p className="mt-1 text-sm text-danger">{errors.marginAlertPercent.message}</p>}
        </div>
        <p className="text-xs text-foreground-muted">{sendingWindowHint(quietHourStart, quietHourEnd)}</p>
      </div>
    </section>
  );
}
