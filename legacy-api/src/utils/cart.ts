import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { round2 } from '@/utils/helpers';

export const cartInclude = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          thumbnail: true,
          price: true,
          quantity: true,
        },
      },
      // Which size and colour the shopper picked; the cart line has to say.
      variant: { select: { id: true, size: true, color: true, sku: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

/** Fetch the user's cart, creating an empty one if it does not exist yet. */
export const getOrCreateCart = async (userId: string): Promise<CartWithItems> => {
  const existing = await prisma.cart.findUnique({
    where: { userId },
    include: cartInclude,
  });
  if (existing) return existing;

  return prisma.cart.create({
    data: { userId },
    include: cartInclude,
  });
};

/** Shape a cart into the canonical API response: { id, items, subtotal, itemCount }. */
export const shapeCart = (cart: CartWithItems) => {
  const items = cart.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
    price: item.price,
    customization: item.customization,
    mockupImage: item.mockupImage,
    product: item.product,
    variant: item.variant,
  }));

  const subtotal = round2(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return { id: cart.id, items, subtotal, itemCount };
};

/** Convenience: fresh, shaped cart for a user. */
export const getShapedCart = async (userId: string) => shapeCart(await getOrCreateCart(userId));
