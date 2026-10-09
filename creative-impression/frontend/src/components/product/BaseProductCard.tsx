import React from 'react';
import Link from 'next/link';
import { ViewTransition } from '@/components/common/ViewTransition';
import { ProductThumb } from './ProductThumb';

/**
 * What a card needs in order to render. Both the catalog `Product` and the
 * Custom Wear `CustomWearProduct` are adapted into this shape, which is why
 * there is one piece of card markup on the site rather than one per domain.
 *
 * Prices arrive preformatted: the catalog shows a single price, Custom Wear
 * shows a per-unit range, and neither belongs in the card's own logic.
 */
export interface ProductCardModel {
  href: string;
  name: string;
  /** The label above the product name, the way a marketplace card reads. */
  brand?: string;
  alt?: string;
  image?: string;
  /** Cross-faded in on hover when the product has a second shot. */
  hoverImage?: string;
  price: string;
  comparePrice?: string;
  discountLabel?: string;
  outOfStock?: boolean;
  /**
   * Shared identity for the route transition. The product page gives its hero
   * the same name, so the browser morphs this thumbnail into it instead of
   * swapping one image for another.
   */
  transitionName?: string;
}

export interface BaseProductCardProps {
  model: ProductCardModel;
  /** Applied to the card's outer element — how a rail gives it width and snap. */
  className?: string;
  /** `priority` for above-the-fold cards so the LCP image is not lazy-loaded. */
  priority?: boolean;
  /** Bar along the bottom of the image, revealed on hover: quick add. */
  mediaBar?: React.ReactNode;
  /**
   * Drawn in place of the photograph when the product has none. Without it
   * `ProductThumb` falls back to a broken-image icon, which reads as a fault
   * rather than as "no photography yet".
   */
  mediaFallback?: React.ReactNode;
  /**
   * A single line under the price. The colour grid uses it for the swatch and
   * colour name; it is the only thing allowed below the price, so a card stays
   * one recognisable object however it is filled.
   */
  footnote?: React.ReactNode;
  /**
   * The colour this card stands for, as a small square at the end of the name
   * line — the 9impression card. Shown on hover as the colour's name.
   */
  swatch?: React.ReactNode;
}

const IMAGE_SIZES = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw';

/**
 * The one product card on the site. Geometry comes from the `.pcard` classes in
 * globals.css — one border, one radius, one image ratio — so no caller sizes
 * images per slot, and a Custom Wear card and a catalog card are the same object
 * at the same size.
 *
 * The body carries the name and the price and nothing else, and the photograph
 * carries no labels or controls at rest — only `mediaBar`, which the catalog
 * uses for a quick-add bar that appears on hover.
 *
 * The media and the title are separate links rather than one link wrapping the
 * whole card, so the controls in those slots are not interactive elements nested
 * inside an anchor.
 */
export const BaseProductCard: React.FC<BaseProductCardProps> = ({
  model,
  className = '',
  priority = false,
  mediaBar,
  mediaFallback,
  footnote,
  swatch,
}) => {
  const { href, name, alt, image, hoverImage, price, comparePrice, discountLabel, brand } = model;

  return (
    <article className={`pcard group h-full ${className}`.trim()}>
      <div className="pcard-media">
        <Link href={href} className="pcard-media-link" tabIndex={-1} aria-hidden="true">
          {/* Paired with the hero of the same product on the next page, so the
              thumbnail morphs into it rather than the pages swapping. */}
          <ViewTransition name={model.transitionName} share="morph" default="none">
            <span className="pcard-img-frame">
              {!image && mediaFallback ? (
                mediaFallback
              ) : (
                <ProductThumb
                  src={image}
                  alt={alt ?? name}
                  fill
                  sizes={IMAGE_SIZES}
                  priority={priority}
                  className="pcard-img"
                  showLabel
                />
              )}
            </span>
          </ViewTransition>
          {hoverImage && (
            <ProductThumb
              src={hoverImage}
              alt=""
              fill
              sizes={IMAGE_SIZES}
              className="pcard-img pcard-img--alt"
            />
          )}
        </Link>

        {/* Out of stock dims the photo but prints nothing on it — the words go
            in the body, with the rest of the product's text. */}
        {model.outOfStock ? <div className="pcard-veil" /> : mediaBar}
      </div>

      <div className="pcard-body">
        {/* Brand first, product name second — the order every marketplace card
            uses, because the brand is what a shopper scans for. */}
        {brand && <p className="pcard-brand">{brand}</p>}
        {/* One line, cut with an ellipsis (full name on hover): every card in a
            row is the same height and the swatch sits level with the name. */}
        <div className="pcard-titlerow">
          <h3 className="pcard-name">
            <Link href={href} className="pcard-title" title={name}>
              {name}
            </Link>
          </h3>
          {swatch}
        </div>

        {model.outOfStock ? (
          <p className="pcard-price pcard-oos">Out of stock</p>
        ) : (
          <p className="pcard-price">
            {price}
            {comparePrice && <span className="pcard-compare">{comparePrice}</span>}
            {discountLabel && <span className="pcard-off">{discountLabel}</span>}
          </p>
        )}

        {footnote}
      </div>
    </article>
  );
};
