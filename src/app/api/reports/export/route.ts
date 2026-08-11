import { NextResponse } from 'next/server';
import { requireSession } from '@/features/auth/service';
import { toCsv } from '@/lib/csv';
import { monthBoundsUtc } from '@/core/dates';
import { getSettings } from '@/features/settings/queries';
import { getSupplierBreakdown, getPlanBreakdown, getAllCustomerBreakdown, type BreakdownRowDTO } from '@/features/reports/queries';
import { formatCents } from '@/lib/format';
import { marginPercent } from '@/core/money';

function rowsToCsv(rows: BreakdownRowDTO[]): string {
  const headers = ['Nome', 'Faturado', 'Custo', 'Lucro', 'Margem'];
  const dataRows = rows.map((row) => {
    const billedCents = BigInt(row.billedCents);
    const costCents = BigInt(row.costCents);
    const profitCents = billedCents - costCents;
    const margin = marginPercent(billedCents, costCents);
    const marginText = margin === null ? '—' : `${margin.toFixed(0)}%`;
    return [row.name, formatCents(row.billedCents), formatCents(row.costCents), formatCents(profitCents), marginText];
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
    csv = rowsToCsv(await getAllCustomerBreakdown(from, to));
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="relatorio-${type}-${year}-${String(month + 1).padStart(2, '0')}.csv"`,
    },
  });
}
