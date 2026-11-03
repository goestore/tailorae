import Link from 'next/link';
import { Button } from '@/components/common';

export interface OrderCtaProps {
  heading: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
}

/**
 * "Ready to Start Your Order?" — the closing call to action.
 *
 * White like the rest of the page; the yellow button carries it. A button with
 * no label is dropped rather than rendered as an empty box, which is how the
 * band goes down to a single call to action.
 */
export const OrderCta: React.FC<OrderCtaProps> = ({
  heading,
  body,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}) => (
  <section className="section-y border-t border-line bg-ink text-white">
    <div className="container-max max-w-3xl text-center">
      <h2 className="mb-4 text-2xl md:text-3xl">{heading}</h2>
      <p className="mb-8 text-sm text-white/70 md:text-base">{body}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {primaryLabel.trim() !== '' && (
          <Link href={primaryHref}>
            <Button size="lg">{primaryLabel}</Button>
          </Link>
        )}
        {secondaryLabel.trim() !== '' && (
          <Link href={secondaryHref}>
            <Button variant="outline" size="lg">
              {secondaryLabel}
            </Button>
          </Link>
        )}
      </div>
    </div>
  </section>
);
