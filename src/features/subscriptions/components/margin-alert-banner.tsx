import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import type { MarginAlertSummary } from '../queries';

function subscriptionsPhrase(count: number, tail: string): string {
  return `${count} assinatura${count > 1 ? 's' : ''} ${tail}`;
}

/**
 * Alerta de margem do Início (`telas/02-inicio.md` §4). Só aparece quando há
 * caso real — alerta que aparece sempre o operador aprende a ignorar.
 *
 * O limite fica em Ajustes e é configurável, por isso o texto diz "abaixo do
 * limite" em vez de cravar 15% como o protótipo.
 */
export function MarginAlertBanner({ summary }: { summary: MarginAlertSummary }) {
  if (summary.negativeCount === 0 && summary.belowThresholdCount === 0) return null;

  const phrases = [
    summary.negativeCount > 0 ? subscriptionsPhrase(summary.negativeCount, 'com margem negativa') : null,
    summary.belowThresholdCount > 0
      ? subscriptionsPhrase(summary.belowThresholdCount, 'com margem abaixo do limite')
      : null,
  ].filter((phrase) => phrase !== null);

  return (
    <Alert tone="danger" className="items-center">
      <span className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-foreground">{phrases.join(' · ')}</span>
        <Link href="/customers" className="text-sm font-bold text-brand-light hover:underline">
          Ver assinaturas
        </Link>
      </span>
    </Alert>
  );
}
