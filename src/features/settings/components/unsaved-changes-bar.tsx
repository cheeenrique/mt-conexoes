'use client';

import { Check, CircleAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Barra sticky no rodapé (handoff §Barra de alterações não salvas). */
export function UnsavedChangesBar({
  isSubmitting,
  onDiscard,
}: {
  isSubmitting: boolean;
  onDiscard: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t-2 border-brand bg-surface px-6 py-3 shadow-[0_-16px_40px_rgba(0,0,0,0.6)]">
      <span className="flex items-center gap-2 text-sm text-foreground">
        <CircleAlert size={16} className="shrink-0 text-brand-light" aria-hidden />
        Alterações ainda não salvas
      </span>
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onDiscard}>
          Descartar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
          {isSubmitting ? 'Salvando...' : 'Salvar alterações'}
        </Button>
      </div>
    </div>
  );
}
