import { NextResponse } from 'next/server';
import { requireSession } from '@/features/auth/service';
import { toCsv } from '@/lib/csv';
import { monthBoundsUtc } from '@/core/dates';
import { getSettings } from '@/features/settings/queries';
import { getSupplierBreakdown, getPlanBreakdown, getCustomerBreakdown, type BreakdownRowDTO } from '@/features/reports/queries';
import { formatCents } from '@/lib/format';
import { marginPercent } from '@/core/money';

function rowsToCsv(rows: BreakdownRowDTO[], extraColumn?: (row: BreakdownRowDTO) => string): string {
  const headers = extraColumn ? ['Grupo', 'Nome', 'Faturado', 'Custo', 'Lucro', 'Margem'] : ['Nome', 'Faturado', 'Custo', 'Lucro', 'Margem'];
  const dataRows = rows.map((row) => {
    const billedCents = BigInt(row.billedCents);
    const costCents = BigInt(row.costCents);
    const profitCents = billedCents - costCents;
    const margin = marginPercent(billedCents, costCents);
    const marginText = margin === null ? '—' : `${margin.toFixed(0)}%`;
    const base = [row.name, formatCents(row.billedCents), formatCents(row.costCents), formatCents(profitCents), marginText];
    return extraColumn ? [extraColumn(row), ...base] : base;
  });
  return toCsv(headers, dataRows);
}

export async function GET(req: Request): Promise<Response> {
  try {
    await requireSession();
  } catch {
    return new NextResponse(null, { status: 401 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const year = Number(url.searchParams.get('year'));
  const month = Number(url.searchParams.get('month')) - 1;

  if (!type || !['supplier', 'plan', 'customer'].includes(type) || !Number.isFinite(year) || !Number.isFinite(month)) {
    return new NextResponse('Parâmetros inválidos', { status: 400 });
  }

  const settings = await getSettings();
  const { from, to } = monthBoundsUtc(year, month, settings.timezone);

  let csv: string;
  if (type === 'supplier') {
    csv = rowsToCsv(await getSupplierBreakdown(from, to));
  } else if (type === 'plan') {
    csv = rowsToCsv(await getPlanBreakdown(from, to));
  } else {
    const { top, bottom } = await getCustomerBreakdown(from, to);
    const top20 = top.map((r) => ({ ...r, __group: 'top' as const }));
    const bottom20 = bottom.map((r) => ({ ...r, __group: 'bottom' as const }));
    csv = rowsToCsv([...top20, ...bottom20], (row) => (row as unknown as { __group: string }).__group);
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="relatorio-${type}-${year}-${String(month + 1).padStart(2, '0')}.csv"`,
    },
  });
}
