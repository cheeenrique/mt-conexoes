import { TZDate } from '@date-fns/tz';
import { daysBetweenLocalDates } from '@/core/dates';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

function plural(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Coluna "Quando" da lista de leads: "há 2 horas", "ontem", "3 dias", ou a
 * data quando já passou uma semana.
 *
 * `now` entra por parâmetro e é resolvido no servidor uma vez por render — se
 * o componente cliente chamasse `new Date()`, o texto renderizado no servidor
 * e o renderizado na hidratação divergiriam.
 *
 * "Ontem" e a contagem de dias saem do calendário **do negócio**, não de uma
 * divisão por 24h: às 09:00, 23:00 do dia anterior faz 10 horas, e ainda
 * assim é ontem para quem opera.
 */
export function relativeWhen(createdAt: Date, now: Date, timezone: string): string {
  const elapsedMs = now.getTime() - createdAt.getTime();

  if (elapsedMs < MINUTE_MS) return 'agora';
  if (elapsedMs < HOUR_MS) return `há ${plural(Math.floor(elapsedMs / MINUTE_MS), 'minuto', 'minutos')}`;

  const days = daysBetweenLocalDates(createdAt, now, timezone);
  if (days === 0) return `há ${plural(Math.floor(elapsedMs / HOUR_MS), 'hora', 'horas')}`;
  if (days === 1) return 'ontem';
  if (days < 7) return plural(days, 'dia', 'dias');

  const local = new TZDate(createdAt, timezone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(local.getDate())}/${pad(local.getMonth() + 1)}/${local.getFullYear()}`;
}
