import { db } from '@/lib/db';

export interface CustomerDTO {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  notes: string | null;
}

export interface CustomerListRowDTO extends CustomerDTO {
  planName: string | null;
  supplierName: string | null;
  nextDueAt: string | null;
}

function toDTO(row: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  notes: string | null;
}): CustomerDTO {
  return row;
}

export async function listCustomers(params: {
  page: number;
  perPage: 8 | 12 | 20;
  q?: string;
}): Promise<{ rows: CustomerListRowDTO[]; total: number }> {
  const where = params.q
    ? {
        OR: [
          { name: { contains: params.q, mode: 'insensitive' as const } },
          { phone: { contains: params.q } },
          { subscriptions: { some: { accessUsername: { contains: params.q, mode: 'insensitive' as const } } } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      include: {
        subscriptions: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: { select: { name: true } }, supplier: { select: { name: true } } },
        },
      },
    }),
    db.customer.count({ where }),
  ]);

  return {
    rows: rows.map((row) => {
      const sub = row.subscriptions[0];
      return {
        ...toDTO(row),
        planName: sub?.plan?.name ?? null,
        supplierName: sub?.supplier?.name ?? null,
        nextDueAt: sub?.nextDueAt.toISOString() ?? null,
      };
    }),
    total,
  };
}

export async function getCustomer(id: string): Promise<CustomerDTO | null> {
  const row = await db.customer.findUnique({ where: { id } });
  return row ? toDTO(row) : null;
}
