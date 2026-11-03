import { Router, Request, Response } from 'express';
import { authMiddleware, adminOnly } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';

/**
 * The dashboard report: one call, every figure and series the dashboard draws.
 *
 * GET /api/admin/report?days=7|30|90
 *
 * "Gross sales" counts every order that was not cancelled (what customers
 * committed to); "paid revenue" counts only orders whose payment cleared. Both
 * are shown, because on a store with cash on delivery the first leads the
 * second by days, and showing only paid revenue makes a busy week look empty.
 *
 * Every figure also comes for the previous window of the same length, so the
 * dashboard can say "up 12%" instead of leaving the operator to remember.
 * Daily series include days with nothing, so a chart never skips a gap.
 */
const router = Router();
router.use(authMiddleware, adminOnly);

const DAY = 86_400_000;
const SOLD = ['CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'DELIVERED', 'PENDING'];

const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
const dayKey = (date: Date): string => {
  const d = startOfDay(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;
const change = (now: number, before: number): number | null =>
  before > 0 ? round2(((now - before) / before) * 100) : null;

router.get('/', async (req: Request, res: Response) => {
  try {
    const requested = Number(req.query.days);
    const days = [7, 30, 90].includes(requested) ? requested : 30;

    const end = new Date();
    const start = startOfDay(new Date(end.getTime() - (days - 1) * DAY));
    const prevStart = new Date(start.getTime() - days * DAY);

    const [orders, prevOrders, newCustomers, prevNewCustomers, accounts, returns, prevReturns, items] =
      await Promise.all([
        prisma.order.findMany({
          where: { createdAt: { gte: start } },
          select: {
            id: true,
            total: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            createdAt: true,
          },
        }),
        prisma.order.findMany({
          where: { createdAt: { gte: prevStart, lt: start } },
          select: { total: true, status: true, paymentStatus: true },
        }),
        prisma.user.findMany({
          where: { createdAt: { gte: start }, role: { in: ['RETAIL_CUSTOMER', 'B2B_BUYER'] } },
          select: { createdAt: true },
        }),
        prisma.user.count({
          where: { createdAt: { gte: prevStart, lt: start }, role: { in: ['RETAIL_CUSTOMER', 'B2B_BUYER'] } },
        }),
        prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
        prisma.returnRequest.count({ where: { createdAt: { gte: start } } }),
        prisma.returnRequest.count({ where: { createdAt: { gte: prevStart, lt: start } } }),
        prisma.orderItem.findMany({
          where: { order: { createdAt: { gte: start }, status: { in: SOLD as never[] } } },
          select: {
            quantity: true,
            price: true,
            vendorId: true,
            product: {
              select: { id: true, name: true, thumbnail: true, category: { select: { name: true } } },
            },
          },
        }),
      ]);

    const isSale = (o: { status: string }) => o.status !== 'CANCELLED';
    const sum = (list: Array<{ total: number }>) => round2(list.reduce((s, o) => s + o.total, 0));

    const sales = orders.filter(isSale);
    const prevSales = prevOrders.filter(isSale);
    const paid = orders.filter((o) => o.paymentStatus === 'PAID');
    const prevPaid = prevOrders.filter((o) => o.paymentStatus === 'PAID');
    const units = items.reduce((s, i) => s + i.quantity, 0);

    const totals = {
      grossSales: sum(sales),
      paidRevenue: sum(paid),
      orders: sales.length,
      averageOrder: sales.length ? round2(sum(sales) / sales.length) : 0,
      newCustomers: newCustomers.length,
      unitsSold: units,
      returns,
    };
    const previous = {
      grossSales: sum(prevSales),
      paidRevenue: sum(prevPaid),
      orders: prevSales.length,
      averageOrder: prevSales.length ? round2(sum(prevSales) / prevSales.length) : 0,
      newCustomers: prevNewCustomers,
      returns: prevReturns,
    };
    const changes = {
      grossSales: change(totals.grossSales, previous.grossSales),
      paidRevenue: change(totals.paidRevenue, previous.paidRevenue),
      orders: change(totals.orders, previous.orders),
      averageOrder: change(totals.averageOrder, previous.averageOrder),
      newCustomers: change(totals.newCustomers, previous.newCustomers),
      returns: change(totals.returns, previous.returns),
    };

    // Daily series, every day present.
    const series = Array.from({ length: days }, (_, i) => {
      const date = new Date(start.getTime() + i * DAY);
      return { date: dayKey(date), grossSales: 0, paidRevenue: 0, orders: 0, newCustomers: 0 };
    });
    const byKey = new Map(series.map((row) => [row.date, row]));
    for (const o of sales) {
      const row = byKey.get(dayKey(o.createdAt));
      if (!row) continue;
      row.grossSales = round2(row.grossSales + o.total);
      row.orders += 1;
      if (o.paymentStatus === 'PAID') row.paidRevenue = round2(row.paidRevenue + o.total);
    }
    for (const u of newCustomers) {
      const row = byKey.get(dayKey(u.createdAt));
      if (row) row.newCustomers += 1;
    }

    // Breakdowns.
    const statusMix = Object.entries(
      orders.reduce<Record<string, number>>((acc, o) => ((acc[o.status] = (acc[o.status] ?? 0) + 1), acc), {})
    )
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    const paymentMix = Object.entries(
      sales.reduce<Record<string, { count: number; value: number }>>((acc, o) => {
        const key = o.paymentMethod ?? 'OTHER';
        acc[key] = acc[key] ?? { count: 0, value: 0 };
        acc[key].count += 1;
        acc[key].value = round2(acc[key].value + o.total);
        return acc;
      }, {})
    ).map(([method, v]) => ({ method, ...v }));

    const categoryMap = new Map<string, { category: string; sales: number; units: number }>();
    const productMap = new Map<string, { id: string; name: string; thumbnail: string | null; category: string; sales: number; units: number }>();
    const sellerMap = new Map<string, { vendorId: string | null; sales: number; units: number }>();
    for (const item of items) {
      const value = item.price * item.quantity;
      const cat = item.product?.category?.name ?? 'Uncategorised';
      const c = categoryMap.get(cat) ?? { category: cat, sales: 0, units: 0 };
      c.sales = round2(c.sales + value);
      c.units += item.quantity;
      categoryMap.set(cat, c);

      if (item.product) {
        const p = productMap.get(item.product.id) ?? {
          id: item.product.id,
          name: item.product.name,
          thumbnail: item.product.thumbnail,
          category: cat,
          sales: 0,
          units: 0,
        };
        p.sales = round2(p.sales + value);
        p.units += item.quantity;
        productMap.set(item.product.id, p);
      }

      const sk = item.vendorId ?? 'house';
      const s = sellerMap.get(sk) ?? { vendorId: item.vendorId, sales: 0, units: 0 };
      s.sales = round2(s.sales + value);
      s.units += item.quantity;
      sellerMap.set(sk, s);
    }

    const sellerRows = [...sellerMap.values()].sort((a, b) => b.sales - a.sales).slice(0, 6);
    const shops = await prisma.vendorProfile.findMany({
      where: { id: { in: sellerRows.map((s) => s.vendorId).filter((id): id is string => Boolean(id)) } },
      select: { id: true, shopName: true },
    });

    const roleCount = (role: string) => accounts.find((a) => a.role === role)?._count._all ?? 0;

    res.json({
      success: true,
      data: {
        range: { days, from: dayKey(start), to: dayKey(end) },
        totals,
        previous,
        changes,
        series,
        statusMix,
        paymentMix,
        categories: [...categoryMap.values()].sort((a, b) => b.sales - a.sales).slice(0, 8),
        topProducts: [...productMap.values()].sort((a, b) => b.units - a.units).slice(0, 6),
        sellers: sellerRows.map((s) => ({
          ...s,
          name: s.vendorId ? shops.find((shop) => shop.id === s.vendorId)?.shopName ?? 'Seller' : 'House stock',
        })),
        accounts: {
          customers: roleCount('RETAIL_CUSTOMER'),
          b2bBuyers: roleCount('B2B_BUYER'),
          sellers: roleCount('VENDOR'),
          admins: roleCount('ADMIN'),
        },
      },
    });
  } catch (error) {
    console.error('[ADMIN] report failed:', error);
    res.status(500).json({ success: false, message: 'Could not build the report' });
  }
});

export default router;
