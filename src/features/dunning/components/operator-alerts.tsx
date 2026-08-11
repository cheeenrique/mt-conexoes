import { formatLocalDate } from '@/lib/format';
import type { OperatorAlertDTO } from '../queries';

export function OperatorAlerts({ alerts, timezone }: { alerts: OperatorAlertDTO[]; timezone: string }) {
  if (alerts.length === 0) return null;

  return (
    <div className="mb-6 rounded-sm border border-warning/40 bg-warning/[.08] p-4">
      <p className="mb-2 text-sm font-bold text-foreground">Alertas recentes</p>
      <ul className="space-y-1 text-sm text-foreground-muted">
        {alerts.map((alert) => (
          <li key={alert.id}>
            {alert.kind === 'suspended' ? 'Assinatura suspensa' : 'Alerta interno'} — {alert.customerName} ({formatLocalDate(alert.at, timezone)})
          </li>
        ))}
      </ul>
    </div>
  );
}
