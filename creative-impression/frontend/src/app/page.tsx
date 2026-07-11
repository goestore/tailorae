import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Button, Card } from '@/components/common';

export const metadata: Metadata = {
  title: 'Home | Creative Impression',
  description: 'Welcome to Creative Impression - Premium Fashion & Custom Apparel Platform',
};

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-primary-50 to-secondary-50 dark:from-neutral-950 dark:to-neutral-900">
        <div className="absolute inset-0 bg-black/20 z-0" />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <h1 className="font-serif text-5xl md:text-7xl font-bold text-neutral-900 dark:text-white mb-6 drop-shadow-lg">
            Creative Impression
          </h1>

          <p className="text-xl md:text-2xl text-neutral-700 dark:text-neutral-200 mb-8 max-w-2xl mx-auto drop-shadow">
            Premium Fashion & Custom Apparel for B2B Wholesale & B2C Retail Customers
          </p>

          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/products">
              <Button size="lg">
                Shop Now
              </Button>
            </Link>
            <Link href="/b2b">
              <Button variant="outline" size="lg">
                B2B Wholesale
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-white dark:bg-neutral-900">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-serif font-bold text-center mb-16 text-neutral-900 dark:text-neutral-50">
            Why Choose Creative Impression?
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                title: 'Premium Quality',
                description: 'Highest quality fabrics and printing techniques for your custom apparel needs',
                icon: '✨',
              },
              {
                title: 'Fast Delivery',
                description: 'Quick turnaround times with reliable shipping partners across India',
                icon: '🚀',
              },
              {
                title: 'Competitive Pricing',
                description: 'Best prices with bulk discounts, special offers, and wholesale pricing',
                icon: '💰',
              },
              {
                title: 'Fashion Manufacturing',
                description: 'Made Easy Design It. Choose It. Receive It. From sketches to finished products, we manage every step.',
                icon: '/images/tailor-cloth-f20a30ae-0b2d-4bd1-af6c-ca7ab7e2e22d.png',
                
              },
            ].map((feature, index) => (
              <Card key={index} hover className="text-center p-8">
                {feature.icon.endsWith('.png') ? (
                  <div className="flex w-full justify-center items-center gap-2 mb-4">
                    <Image src={feature.icon} alt={feature.title} width={48} height={48} className="object-contain" />
                  </div>
                ) : (
                  <div className="text-4xl mb-4">{feature.icon}</div>
                )}
                <h3 className="text-2xl font-bold mb-3 text-neutral-900 dark:text-neutral-50">{feature.title}</h3>
                <p className="text-neutral-600 dark:text-neutral-400">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-20 px-4 bg-neutral-50 dark:bg-neutral-800">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-serif font-bold text-center mb-16 text-neutral-900 dark:text-neutral-50">
            Our Services
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                title: 'Custom Printing',
                description: 'Screen printing, DTG, embroidery, and heat transfer services',
                icon: '🖨️',
                href: '/custom-printing',
              },
              {
                title: 'B2B Wholesale',
                description: 'Bulk orders with special pricing for businesses and resellers',
                icon: '🏢',
                href: '/b2b',
              },
              {
                title: 'Ready-to-Wear',
                description: 'Premium fashion apparel for retail customers',
                icon: '👕',
                href: '/products',
              },
              {
                title: 'Design Services',
                description: 'Professional design assistance for your custom projects',
                icon: '🎨',
                href: '/design-services',
              },
            ].map((service, index) => (
              <Link key={index} href={service.href}>
                <Card hover className="text-center p-6 h-full">
                  {service.icon.endsWith('.png') ? (
                    <div className="flex justify-center mb-4">
                      <Image src={service.icon} alt={service.title} width={48} height={48} className="object-contain" />
                    </div>
                  ) : (
                    <div className="text-3xl mb-4">{service.icon}</div>
                  )}
                  <h3 className="text-xl font-bold mb-3 text-neutral-900 dark:text-neutral-50">{service.title}</h3>
                  <p className="text-neutral-600 dark:text-neutral-400 text-sm">{service.description}</p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary-600 text-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-serif font-bold mb-6">
            Ready to Start Your Order?
          </h2>
          <p className="text-lg mb-8">
            Join thousands of satisfied customers who trust Creative Impression for their fashion and printing needs.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/products">
              <Button size="lg" className="bg-white text-primary-600 hover:bg-neutral-50">
                Shop Products
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-primary-600">
                Get Quote
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
