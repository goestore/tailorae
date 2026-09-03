import React from 'react';
import { Card, Button } from '@/components/common';
import Link from 'next/link';

const services = [
  {
    title: 'Custom Apparel Manufacturing',
    description: 'We manufacture premium-quality apparel according to your exact specifications — design, tech pack, size chart, fabric requirement, brand label, and packaging.',
    number: '01',
  },
  {
    title: 'Private Label Manufacturing',
    description: 'Build your own fashion brand with confidence. Custom branding, woven labels, hang tags, and custom packaging under your brand name.',
    number: '02',
  },
  {
    title: 'Product Design & Development',
    description: 'Our experienced designers help create fashion collections, seasonal designs, tech packs, artwork, and fabric suggestions.',
    number: '03',
  },
  {
    title: 'Export Manufacturing',
    description: 'With years of export manufacturing experience, we understand international quality expectations, compliance, and timely delivery.',
    number: '04',
  },
  {
    title: 'Retail & Wholesale Business Solutions',
    description: 'We help businesses move from offline to online, build digital presence, expand sales channels, and grow internationally.',
    number: '05',
  },
  {
    title: 'Marketplace & eCommerce Support',
    description: 'Product listing, catalog creation, image management, marketplace onboarding, inventory, and order management support.',
    number: '06',
  },
];

const whyChooseUs = [
  '15+ Years of Industry Experience',
  'End-to-End Solutions',
  'Custom Manufacturing',
  'Flexible Production',
  'Quality First',
  'Global Business Support',
];

const industries = [
  'Fashion Brands',
  'Clothing Startups',
  'Retail Stores',
  'Wholesale Businesses',
  'Corporate Uniform Suppliers',
  'Sportswear Brands',
  'Promotional Apparel Companies',
  'E-commerce Sellers',
  'Boutique Brands',
  'Export Buyers',
];

export default function AboutPage() {
  return (
    <main>
      {/* Hero Section */}
      <section className="section-y border-b border-line bg-surface">
        <div className="page-intro mx-auto max-w-4xl text-center">
          <p>About Tailorae</p>
          <h1 className="mb-6 text-ink">
            Transforming Apparel Manufacturing with Innovation, Experience & Global Reach
          </h1>
          <span className="mx-auto mb-6 text-lg md:text-xl">
            At Tailorae, we believe every brand deserves high-quality, customized apparel backed by reliable manufacturing and modern eCommerce solutions.
          </span>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/info/contact">
              <Button size="lg">
                Get Started
              </Button>
            </Link>
            <Link href="#services">
              <Button variant="outline" size="lg">
                Our Services
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* About & Mission Section */}
      <section className="section-y bg-white">
        <div className="container-max max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-center">
            <div>
              <h2 className="mb-6 text-3xl text-ink md:text-4xl">
                Your Complete Apparel Business Partner
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 text-lg leading-relaxed mb-6">
                With more than 15 years of experience in the eCommerce, apparel manufacturing, and export industries, we have worked closely with businesses of all sizes to understand the challenges of product development, sourcing, branding, and online selling.
              </p>
              <p className="text-neutral-600 dark:text-neutral-300 text-lg leading-relaxed mb-8">
                Our experience has inspired us to build Tailorae as a complete solution for retailers, wholesalers, startups, fashion brands, corporate buyers, and entrepreneurs worldwide.
              </p>
              <div className="border-l-2 border-[var(--brand)] bg-surface-2 p-5">
                <h3 className="mb-2 text-xl text-ink">Our mission</h3>
                <p className="text-ink-2">
                  To become one of the world&apos;s leading custom apparel manufacturing partners while helping businesses grow from offline to online with complete end-to-end support.
                </p>
              </div>
            </div>
            <div className="card rounded-card p-5 md:p-4">
              <h3 className="mb-6 text-ink">Our Vision</h3>
              <p className="text-ink-3 text-lg leading-relaxed mb-6">
                To build a global ecosystem where anyone—from a startup clothing brand to an established retailer—can launch and scale their apparel business without worrying about manufacturing, product development, or supply chain management.
              </p>
              <p className="text-ink-3 text-lg leading-relaxed">
                We aim to make customized apparel manufacturing simple, reliable, affordable, and accessible across the world.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="section-y border-t border-line bg-white">
        <div className="container-max">
          <div className="mb-8 text-center">
            <p className="mb-3 text-xs uppercase tracking-[0.14em] text-[var(--brand-700)]">What we do</p>
            <h2 className="mb-4 text-3xl text-ink md:text-4xl">
              More Than Just a Manufacturer
            </h2>
            <p className="text-neutral-600 dark:text-neutral-300 text-lg max-w-2xl mx-auto">
              We are your complete apparel business partner — providing comprehensive solutions at every stage.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-px bg-line md:grid-cols-2 lg:grid-cols-3">
            {services.map((service, index) => (
              <Card key={index} hover className="h-full border-0 p-6">
                <div className="mb-8 text-xs tracking-[0.14em] text-[var(--brand-700)]">{service.number}</div>
                <h3 className="mb-3 text-xl text-ink">
                  {service.title}
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {service.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="section-y border-t border-line bg-white">
        <div className="container-max max-w-6xl">
          <div className="mb-8 text-center">
            <p className="mb-3 text-xs uppercase tracking-[0.14em] text-[var(--brand-700)]">Why Tailorae</p>
            <h2 className="mb-4 text-3xl text-ink md:text-4xl">
              Built on Trust, Driven by Excellence
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {whyChooseUs.map((item, index) => (
              <Card key={index} className="flex items-center gap-4 p-4">
                <div className="h-2 w-2 flex-shrink-0 bg-[var(--brand)]" />
                <span className="text-ink">{item}</span>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Industries Section */}
      <section className="section-y border-t border-line bg-white">
        <div className="container-max max-w-6xl">
          <div className="mb-8 text-center">
            <p className="mb-3 text-xs uppercase tracking-[0.14em] text-[var(--brand-700)]">Industries</p>
            <h2 className="mb-4 text-3xl text-ink md:text-4xl">
              Supporting Businesses Across Industries
            </h2>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {industries.map((industry, index) => (
              <span key={index} className="border border-line px-3 py-2 text-sm text-ink-2">
                {industry}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Commitment Section */}
      <section className="py-10 md:py-14 bg-white border-t border-line">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="mb-6 text-ink">Our Commitment</h2>
          <p className="text-ink-3 text-lg md:text-xl leading-relaxed mb-8 max-w-3xl mx-auto">
            At Tailorae, we don&apos;t just manufacture apparel—we help businesses grow. Our goal is to become a long-term partner by providing dependable service, consistent quality, transparent communication, and innovative solutions.
          </p>
          <div className="card rounded-card p-5 md:p-4 max-w-3xl mx-auto">
            <h3 className="mb-4 text-ink">Your Vision. Our Expertise. Together We Create Success.</h3>
            <p className="text-ink-3 text-lg leading-relaxed">
              From product development to global manufacturing and eCommerce growth, Tailorae is committed to helping your business succeed with customized apparel solutions tailored to your needs.
            </p>
          </div>
          <div className="mt-6">
            <Link href="/info/contact">
              <Button size="lg">
                Contact Us Today
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
