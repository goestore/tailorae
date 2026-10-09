import { prisma } from '@/lib/prisma';
import { round2 } from '@/utils/helpers';

/**
 * Aggregate ratings, kept in one place so every path that changes a review
 * (a shopper posting one, an admin hiding one) recomputes the same numbers.
 *
 * A shop's rating is the average of every published review across its
 * listings, not an average of product averages. Otherwise a product with one
 * five-star review would weigh as much as one with two hundred reviews.
 */

export async function recomputeProductRating(productId: string): Promise<void> {
  const aggregate = await prisma.review.aggregate({
    where: { productId, isPublished: true },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      rating: round2(aggregate._avg.rating ?? 0),
      ratingCount: aggregate._count._all,
      reviewCount: aggregate._count._all,
    },
    select: { vendorId: true },
  });

  if (product.vendorId) await recomputeVendorRating(product.vendorId);
}

export async function recomputeVendorRating(vendorId: string): Promise<void> {
  const aggregate = await prisma.review.aggregate({
    where: { isPublished: true, product: { vendorId } },
    _avg: { rating: true },
    _count: { _all: true },
  });

  await prisma.vendorProfile.update({
    where: { id: vendorId },
    data: {
      rating: round2(aggregate._avg.rating ?? 0),
      ratingCount: aggregate._count._all,
    },
  });
}
