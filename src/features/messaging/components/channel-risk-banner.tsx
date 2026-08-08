import { TriangleAlert } from 'lucide-react';

export function ChannelRiskBanner({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (value: boolean) => void;
}) {
  return (
    <div className="mb-4 rounded-sm border border-warning/40 bg-warning/[.08] p-3">
      <div className="mb-2 flex items-start gap-2 text-sm text-foreground">
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" />
        <p>
          A Evolution API viola os Termos de Uso do WhatsApp. Banimento do número é questão de
          quando, não de se. O servidor e o número são de sua responsabilidade — o sistema só
          fala com a instância que você provisionar.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground-muted">
        <input type="checkbox" checked={accepted} onChange={(e) => onAcceptedChange(e.target.checked)} />
        Estou ciente do risco e quero continuar.
      </label>
    </div>
  );
}
