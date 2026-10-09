import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import {
  HttpError,
  isHttpError,
  isNonEmptyString,
  parseAddressInput,
  randomSuffix,
  round2,
} from '@/utils/helpers';
import { countCouponUsesByUser, findCouponByCode, resolveCoupon } from '@/utils/coupons';
import {
  allocateSellerOrders,
  sellerOrderNumber,
  type SellerGroup,
} from '@/utils/order-split';
import { cancelOrder } from '@/utils/order-status';
import { createCommissionResolver, prismaCategoryLoader } from '@/utils/commission';
import { getSetting } from '@/utils/settings';
import { sendOrderConfirmation } from '@/services/notifications';
import { razorpayReady, razorpayUnavailableReason } from '@/services/payments/razorpay';

const router = Router();

const orderInclude = {
  items: {
    include: {
      product: { select: { id: true, name: true, slug: true, thumbnail: true } },
    },
  },
  shippingAddress: true,
  billingAddress: true,
  // Each shop's half, so the customer can see that a two-seller order ships in
  // two parcels rather than wondering why half of it arrived.
  sellerOrders: {
    orderBy: { orderNumber: 'asc' as const },
    include: {
      vendor: { select: { id: true, shopName: true, shopSlug: true } },
      items: { select: { id: true } },
    },
  },
  timeline: { orderBy: { createdAt: 'asc' as const } },
  // Included so the account page can show a return that is already in flight
  // instead of offering the button again and answering 409.
  returnRequest: true,
} satisfies Prisma.OrderInclude;

// Free shipping threshold and flat rate (INR).
const FREE_SHIPPING_THRESHOLD = 999;
const FLAT_SHIPPING_COST = 49;

// @route   GET /api/orders
// @desc    Get user orders
// @access  Private
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, slug: true, thumbnail: true } },
          },
        },
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    });

    res.json({
      success: true,
      message: 'Orders fetched',
      data: { orders },
    });
  } catch (error) {
    console.error('[ORDERS] list failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
    });
  }
});

// @route   GET /api/orders/:id
// @desc    Get order details
// @access  Private
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Accepts the id or the customer-facing order number (CI-…), so the order
    // page can open straight from the number in a confirmation email without
    // downloading the customer's whole order history to find one row.
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: req.params.id },
          { orderNumber: { equals: req.params.id, mode: 'insensitive' } },
        ],
      },
      include: orderInclude,
    });

    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    if (order.userId !== req.userId && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'You do not have access to this order' });
      return;
    }

    res.json({
      success: true,
      message: 'Order fetched',
      data: { order },
    });
  } catch (error) {
    console.error('[ORDERS] get failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
    });
  }
});

// @route   POST /api/orders
// @desc    Create new order (checkout) — cash on delivery, or unpaid pending Razorpay
// @access  Private
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { shippingAddress, billingAddress, paymentMethod, couponCode, notes } = req.body ?? {};
    const userId = req.userId!;

    // Validate addresses
    const shippingParsed = parseAddressInput(shippingAddress, 'shippingAddress');
    if (!shippingParsed.address) {
      res.status(400).json({ success: false, message: shippingParsed.errors.join('. ') });
      return;
    }
    let billingParsed: typeof shippingParsed | null = null;
    if (billingAddress !== undefined && billingAddress !== null) {
      billingParsed = parseAddressInput(billingAddress, 'billingAddress');
      if (!billingParsed.address) {
        res.status(400).json({ success: false, message: billingParsed.errors.join('. ') });
        return;
      }
    }

    /**
     * Cash on delivery, or online through Razorpay. Nothing else — the enum
     * carries CREDIT_CARD, STRIPE, PAYPAL and several more, but a value
     * accepted here has to correspond to a rail that actually exists, and only
     * these two do.
     *
     * An online order is created *unpaid*, and that ordering is the point: the
     * order is written first so that the amount the customer is charged can be
     * read from the database by `POST /api/payments/razorpay/create-order`
     * rather than sent up from the browser. It stays PENDING until the gateway
     * says otherwise, and the webhook is what marks it PAID.
     */
    if (paymentMethod !== 'COD' && paymentMethod !== 'RAZORPAY') {
      res.status(400).json({
        success: false,
        message: 'paymentMethod must be COD or RAZORPAY',
      });
      return;
    }
    const method: 'COD' | 'RAZORPAY' = paymentMethod;

    if (method === 'RAZORPAY' && !razorpayReady()) {
      // Refused before the order exists rather than after. An order a customer
      // has no way to pay for is worse than a checkout that says why — and the
      // storefront disables the option ahead of this, so reaching here means a
      // stale page or a direct API call.
      res.status(503).json({
        success: false,
        message: razorpayUnavailableReason() ?? 'Online payment is not available',
      });
      return;
    }
    if (couponCode !== undefined && !isNonEmptyString(couponCode)) {
      res.status(400).json({ success: false, message: 'couponCode must be a non-empty string' });
      return;
    }
    if (notes !== undefined && typeof notes !== 'string') {
      res.status(400).json({ success: false, message: 'notes must be a string' });
      return;
    }

    // Read before the transaction: a setting, not a row this order locks.
    const defaultCommissionRate = await getSetting('commission.defaultRate');

    const orderId = await prisma.$transaction(async (tx) => {
      // 1. Load cart
      const cart = await tx.cart.findUnique({
        where: { userId },
        include: { items: { include: { product: true, variant: true } } },
      });
      if (!cart || cart.items.length === 0) {
        throw new HttpError(400, 'Your cart is empty');
      }

      /**
       * 2. Re-validate every line against the catalogue as it stands now.
       *
       * A cart is a snapshot taken minutes or weeks ago, and checkout is the
       * last moment anything checks it against reality. Stock was the only
       * thing being re-checked, so a product discontinued since it was added,
       * or one belonging to a shop that has since been suspended, converted
       * into a real order with a real obligation to fulfil it. The quantity
       * bounds are the same story from the other side: the columns exist, the
       * cart offers them as guidance, and nothing enforced them at the point
       * they cost money.
       */
      const vendorIdsInCart = [
        ...new Set(
          cart.items
            .map((item) => item.product.vendorId)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      const cartVendors = vendorIdsInCart.length
        ? await tx.vendorProfile.findMany({
            where: { id: { in: vendorIdsInCart } },
            select: { id: true, shopName: true, isActive: true, isVerified: true },
          })
        : [];

      for (const item of cart.items) {
        const { product } = item;

        if (product.status !== 'ACTIVE' || product.moderationStatus !== 'APPROVED') {
          throw new HttpError(409, `${product.name} is no longer available`);
        }

        if (product.vendorId) {
          const shop = cartVendors.find((vendor) => vendor.id === product.vendorId);
          // A missing profile means the shop was deleted out from under the
          // listing; treat it exactly as a closed one rather than as house stock.
          if (!shop || !shop.isActive || !shop.isVerified) {
            throw new HttpError(
              409,
              `${product.name} cannot be ordered right now — the seller is not currently taking orders`
            );
          }
        }

        const availableStock = item.variant ? item.variant.quantity : product.quantity;
        if (item.quantity > availableStock) {
          throw new HttpError(409, `Insufficient stock for ${product.name}`);
        }
        if (item.quantity < product.minOrderQuantity) {
          throw new HttpError(
            400,
            `${product.name} has a minimum order of ${product.minOrderQuantity}`
          );
        }
        if (product.maxOrderQuantity !== null && item.quantity > product.maxOrderQuantity) {
          throw new HttpError(
            400,
            `${product.name} is limited to ${product.maxOrderQuantity} per order`
          );
        }
      }

      // 3. Create address rows
      const shipping = await tx.address.create({
        data: { userId, ...shippingParsed.address! },
      });
      const billing = billingParsed?.address
        ? await tx.address.create({ data: { userId, ...billingParsed.address } })
        : shipping; // billing defaults to shipping

      // 4. Compute totals from cart snapshot prices
      const subtotal = round2(cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0));

      // 5. Validate coupon
      let discount = 0;
      let appliedCouponCode: string | null = null;
      if (isNonEmptyString(couponCode)) {
        const coupon = await findCouponByCode(tx, couponCode);

        /**
         * Checkout is where a coupon's restrictions are actually enforced: it
         * is the only caller that knows who is buying and what is in the
         * basket. The buyer's role is read from the database rather than from
         * the token, which can be up to a week stale — a shopper approved as a
         * trade account this morning should not be refused a B2B code because
         * they last signed in yesterday.
         */
        const buyer = await tx.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });
        const result = resolveCoupon(coupon, subtotal, {
          user: buyer,
          items: cart.items.map((item) => ({
            productId: item.productId,
            categoryId: item.product.categoryId,
            price: item.price,
            quantity: item.quantity,
          })),
          userUsageCount: coupon
            ? await countCouponUsesByUser(tx, coupon.code, userId)
            : 0,
        });
        if (!result.ok) throw new HttpError(result.status, result.error!);
        discount = result.discount;
        appliedCouponCode = coupon!.code;

        await tx.coupon.update({
          where: { id: coupon!.id },
          data: { usageCount: { increment: 1 } },
        });
      }

      const shippingCost = subtotal - discount >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_COST;
      const tax = 0; // TODO: GST calculation
      const total = round2(subtotal - discount + shippingCost + tax);

      const orderNumber = `CI-${Date.now()}-${randomSuffix(4)}`;

      // 6. Create order + items (copy snapshot data from cart)
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          paymentMethod: method,
          shippingAddressId: shipping.id,
          billingAddressId: billing.id,
          subtotal,
          discount,
          discountCode: appliedCouponCode,
          tax,
          shippingCost,
          total,
          gstNumber: shippingParsed.address!.gstNumber,
          notes: isNonEmptyString(notes) ? notes.trim() : null,
          items: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              price: item.price,
              customization:
                item.customization === null
                  ? undefined
                  : (item.customization as Prisma.InputJsonValue),
              mockupImage: item.mockupImage,
              sku: item.variant?.sku ?? item.product.sku,
              // Who sold this line, fixed at order time. A product can change
              // hands afterwards; what was settled must not move with it.
              vendorId: item.product.vendorId,
            })),
          },
        },
      });

      /**
       * 6b. Split the order across the shops fulfilling it.
       *
       * One row per distinct seller (house stock groups under `null`), each
       * carrying its own share of the coupon and shipping, its own commission
       * at the rates in force right now, and its own status to move through
       * fulfilment. The arithmetic lives in utils/order-split, which is unit
       * tested — this is the part that has to reconcile to the paisa.
       *
       * Commission is resolved per line (utils/commission): the seller's
       * override, else the item's category chain, else the platform default.
       * A null override means "use the category", never zero.
       */
      const createdItems = await tx.orderItem.findMany({
        where: { orderId: order.id },
        select: {
          id: true,
          vendorId: true,
          price: true,
          quantity: true,
          product: { select: { categoryId: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Rates are read once, here, and then snapshotted onto each row.
      const vendorIds = [
        ...new Set(createdItems.map((item) => item.vendorId).filter((id): id is string => Boolean(id))),
      ];
      const overrides = vendorIds.length
        ? await tx.vendorProfile.findMany({
            where: { id: { in: vendorIds } },
            select: { id: true, commissionRate: true },
          })
        : [];
      const resolver = createCommissionResolver(prismaCategoryLoader(tx), defaultCommissionRate);

      const bySeller = new Map<
        string,
        { vendorId: string | null; lines: SellerGroup['lines']; itemIds: string[] }
      >();
      for (const item of createdItems) {
        const key = item.vendorId ?? '__house__';
        const bucket = bySeller.get(key) ?? { vendorId: item.vendorId, lines: [], itemIds: [] };
        bucket.lines.push({
          subtotal: round2(item.price * item.quantity),
          commissionRate: await resolver.rateFor(
            item.vendorId,
            overrides.find((shop) => shop.id === item.vendorId)?.commissionRate ?? null,
            item.product.categoryId
          ),
        });
        bucket.itemIds.push(item.id);
        bySeller.set(key, bucket);
      }

      const buckets = [...bySeller.values()];
      const groups: SellerGroup[] = buckets.map(({ vendorId, lines }) => ({ vendorId, lines }));

      const allocations = allocateSellerOrders(groups, discount, shippingCost);

      for (const [index, allocation] of allocations.entries()) {
        const sellerOrder = await tx.sellerOrder.create({
          data: {
            orderNumber: sellerOrderNumber(orderNumber, index),
            orderId: order.id,
            vendorId: allocation.vendorId,
            status: 'PENDING',
            subtotal: allocation.subtotal,
            discount: allocation.discount,
            shippingCost: allocation.shippingCost,
            total: allocation.total,
            commissionRate: allocation.commissionRate,
            commissionAmount: allocation.commissionAmount,
            payoutAmount: allocation.payoutAmount,
          },
        });
        // Per line, because each line can carry its own rate and amount.
        for (const [lineIndex, line] of allocation.lines.entries()) {
          await tx.orderItem.update({
            where: { id: buckets[index].itemIds[lineIndex] },
            data: {
              sellerOrderId: sellerOrder.id,
              commissionRate: line.commissionRate,
              commissionAmount: line.commissionAmount,
            },
          });
        }
      }

      /**
       * 7. Decrement stock and record inventory movements.
       *
       * Stock comes off for a prepaid order too, before any money has arrived,
       * because the alternative is overselling the last item to whoever
       * happens to reach the gateway second. The cost of that choice is an
       * abandoned online checkout holding stock indefinitely: the order sits at
       * PENDING/FAILED and nothing sweeps it. Cancelling one restocks it
       * (`cancelOrder`), so the gap is a reaper for stale unpaid orders, not a
       * missing restock path.
       */
      for (const item of cart.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { quantity: { decrement: item.quantity } },
          });
        }
      }
      await tx.inventoryTracking.createMany({
        data: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          type: 'stock_out',
          reference: orderNumber,
        })),
      });

      // 8. Timeline + clear cart
      await tx.orderTimeline.create({
        data: { orderId: order.id, status: 'PENDING', message: 'Order placed', createdBy: userId },
      });
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return order.id;
    });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });

    // After the transaction has committed, and deliberately not awaited: the
    // order is placed either way, and a slow or missing mail server must not
    // hold the shopper on a spinner at the last step of checkout.
    //
    // Only for cash on delivery. A prepaid order has not been paid yet at this
    // point, and a confirmation sent now would either arrive while the customer
    // is still in the gateway or — if they abandon it — confirm an order that
    // never happened. `services/payments/record` sends it when the money lands.
    if (method === 'COD') void sendOrderConfirmation(orderId);

    res.status(201).json({
      success: true,
      message:
        method === 'COD' ? 'Order placed successfully' : 'Order created — payment required',
      data: {
        order,
        // The storefront branches on this rather than re-deriving it from the
        // payment method, so the two cannot disagree about whether the customer
        // still owes money.
        payment: {
          required: method === 'RAZORPAY',
          method,
        },
      },
    });
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[ORDERS] create failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
    });
  }
});

// @route   PATCH /api/orders/:id/cancel
// @desc    Cancel order (only PENDING/CONFIRMED)
// @access  Private
//
// The work is done by `cancelOrder`, shared with the admin console, because
// cancelling touches four things that have to move together: the parent status,
// every shop's sub-order, the stock, and the coupon use the order consumed.
// This route used to do the first and third only — which left each seller a
// live sub-order they could walk to DELIVERED and be paid for, on an order the
// customer had cancelled.
router.patch('/:id/cancel', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true, status: true },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    if (existing.userId !== req.userId) {
      res.status(403).json({ success: false, message: 'You do not have access to this order' });
      return;
    }
    if (existing.status !== 'PENDING' && existing.status !== 'CONFIRMED') {
      res.status(409).json({
        success: false,
        message: `Order can no longer be cancelled (status: ${existing.status})`,
      });
      return;
    }

    await prisma.$transaction((tx) =>
      cancelOrder(tx, {
        orderId: existing.id,
        actorId: req.userId!,
        message: 'Order cancelled by customer',
      })
    );

    const order = await prisma.order.findUnique({
      where: { id: existing.id },
      include: orderInclude,
    });

    res.json({
      success: true,
      message: 'Order cancelled',
      data: { order },
    });
  } catch (error) {
    console.error('[ORDERS] cancel failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
    });
  }
});

// @route   PATCH /api/orders/:id/return
// @desc    Request return for order (only DELIVERED)
// @access  Private
//
// Requesting is deliberately not completing. The order stays DELIVERED and the
// goods stay out of stock until an admin marks the request COMPLETED through
// `PATCH /admin/returns/:id`, which is where the refund is recorded, the stock
// comes back and both the order and its sub-orders become RETURNED. Moving the
// order to RETURNED here would restock goods still in the customer's hands and
// tell settlement not to pay a seller who may yet be owed.
//
// What the request does do immediately is stop the clock: `payableWhere()` in
// utils/settlement excludes any sub-order whose parent has an open return, so a
// return opened on day two cannot be overtaken by a payout on day seven.
router.patch('/:id/return', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { reason, description } = req.body ?? {};
    // RETURN (refund) or EXCHANGE (swap for another size/colour). Anything
    // else is refused rather than silently stored as a return.
    const requestType = req.body?.requestType === undefined ? 'RETURN' : req.body.requestType;
    if (requestType !== 'RETURN' && requestType !== 'EXCHANGE') {
      res.status(400).json({ success: false, message: 'requestType must be RETURN or EXCHANGE' });
      return;
    }

    if (!isNonEmptyString(reason)) {
      res.status(400).json({ success: false, message: 'reason is required' });
      return;
    }
    if (description !== undefined && typeof description !== 'string') {
      res.status(400).json({ success: false, message: 'description must be a string' });
      return;
    }

    const existing = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { returnRequest: true },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    if (existing.userId !== req.userId) {
      res.status(403).json({ success: false, message: 'You do not have access to this order' });
      return;
    }
    if (existing.status !== 'DELIVERED') {
      res.status(409).json({ success: false, message: 'Only delivered orders can be returned' });
      return;
    }
    if (existing.returnRequest) {
      res.status(409).json({ success: false, message: 'A return has already been requested for this order' });
      return;
    }

    const returnRequest = await prisma.returnRequest.create({
      data: {
        orderId: existing.id,
        requestType,
        reason: reason.trim(),
        description: isNonEmptyString(description) ? description.trim() : null,
      },
    });

    await prisma.orderTimeline.create({
      data: {
        orderId: existing.id,
        status: requestType === 'EXCHANGE' ? 'EXCHANGE_REQUESTED' : 'RETURN_REQUESTED',
        message:
          requestType === 'EXCHANGE' ? 'Exchange requested by customer' : 'Return requested by customer',
        createdBy: req.userId!,
      },
    });

    res.json({
      success: true,
      message: requestType === 'EXCHANGE' ? 'Exchange requested' : 'Return requested',
      data: { returnRequest },
    });
  } catch (error) {
    console.error('[ORDERS] return failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request return',
    });
  }
});

export default router;
