import React from 'react';
import { Card } from '@/components/common';

export interface FeaturedProductsProps {
  products?: Array<{
    id: string;
    name: string;
    price: number;
    image: string;
    rating?: number;
  }>;
}

export const FeaturedProducts: React.FC<FeaturedProductsProps> = ({
  products = [
    {
      id: '1',
      name: 'Premium Business Cards',
      price: 299,
      image: '/images/product-1.jpg',
      rating: 4.5,
    },
    {
      id: '2',
      name: 'Custom T-Shirts',
      price: 499,
      image: '/images/product-2.jpg',
      rating: 4.8,
    },
    {
      id: '3',
      name: 'A4 Posters',
      price: 199,
      image: '/images/product-3.jpg',
      rating: 4.3,
    },
    {
      id: '4',
      name: 'Branded Mugs',
      price: 399,
      image: '/images/product-4.jpg',
      rating: 4.6,
    },
  ],
}) => {
  return (
    <section className="section-y border-t border-line bg-surface">
      <div className="container-max">
        <div className="mb-8 flex items-end justify-between border-b border-line pb-4 md:mb-10">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.16em] text-ink-3">Selected work</p>
            <h2 className="text-2xl md:text-3xl">Featured products</h2>
          </div>
          <span className="hidden text-sm text-ink-3 sm:block">Made to be remembered</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {products.map((product) => (
            <Card key={product.id} className="overflow-hidden p-0 hover:border-black hover:shadow-2 transition-[border-color,box-shadow]">
              <div
                className="h-48 bg-cover bg-center"
                style={{ backgroundImage: `url('${product.image}')` }}
              />
              <div className="p-4">
                <h3 className="mb-3 text-lg">{product.name}</h3>
                <div className="flex items-center justify-between">
                  <span className="text-xl text-ink">₹{product.price}</span>
                  {product.rating && (
                    <span className="text-sm text-[var(--brand-700)]">★ {product.rating}</span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
