import type { UseFormRegister } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SettingsFormValues } from '../schema';

function PixPreview({ pixKey, pixHolderName }: { pixKey: string; pixHolderName: string }) {
  if (!pixKey || !pixHolderName) return null;
  return (
    <div className="rounded-sm bg-surface-elevated p-3">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-foreground-muted">Como o cliente vê</p>
      <p className="text-sm text-foreground">
        Pix <span className="font-mono tabular-mono">{pixKey}</span> ({pixHolderName}). Assim que cair, seu acesso segue normalmente.
      </p>
    </div>
  );
}

export function ReceivingSection({
  register,
  pixKey,
  pixHolderName,
}: {
  register: UseFormRegister<SettingsFormValues>;
  pixKey: string;
  pixHolderName: string;
}) {
  return (
    <section className="rounded border border-border bg-surface p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-foreground-muted">Recebimento</h2>
      <p className="mb-3 text-xs text-foreground-muted">
        Estes dois campos substituem as variáveis de Pix nas mensagens da régua.
      </p>
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="pixKey">Chave Pix</Label>
          <Input id="pixKey" {...register('pixKey')} className="h-11 font-mono tabular-mono" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pixHolderName">Titular</Label>
          <Input id="pixHolderName" {...register('pixHolderName')} className="h-11" />
        </div>
        <PixPreview pixKey={pixKey} pixHolderName={pixHolderName} />
      </div>
    </section>
  );
}
