import React from 'react';
import { Card, Badge, Button } from '@/components/common';
import Link from 'next/link';

const services = [
  {
    title: 'Custom Apparel Manufacturing',
    description: 'We manufacture premium-quality apparel according to your exact specifications — design, tech pack, size chart, fabric requirement, brand label, and packaging.',
    icon: '👕',
  },
  {
    title: 'Private Label Manufacturing',
    description: 'Build your own fashion brand with confidence. Custom branding, woven labels, hang tags, and custom packaging under your brand name.',
    icon: '🏷️',
  },
  {
    title: 'Product Design & Development',
    description: 'Our experienced designers help create fashion collections, seasonal designs, tech packs, artwork, and fabric suggestions.',
    icon: '🎨',
  },
  {
    title: 'Export Manufacturing',
    description: 'With years of export manufacturing experience, we understand international quality expectations, compliance, and timely delivery.',
    icon: '🌍',
  },
  {
    title: 'Retail & Wholesale Business Solutions',
    description: 'We help businesses move from offline to online, build digital presence, expand sales channels, and grow internationally.',
    icon: '📈',
  },
  {
    title: 'Marketplace & eCommerce Support',
    description: 'Product listing, catalog creation, image management, marketplace onboarding, inventory, and order management support.',
    icon: '🛒',
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
      <section className="relative py-8 md:py-10 bg-white border-b border-line">
        <div className="relative z-10 container-max max-w-5xl text-center">
          <Badge variant="secondary" className="mb-6 text-sm font-medium px-4 py-1.5">
            About Tailorae
          </Badge>
          <h1 className="mb-6 text-ink">
            Transforming Apparel Manufacturing with Innovation, Experience & Global Reach
          </h1>
          <p className="text-lg md:text-xl text-ink-3 max-w-3xl mx-auto mb-6 leading-relaxed">
            At Tailorae, we believe every brand deserves high-quality, customized apparel backed by reliable manufacturing and modern eCommerce solutions.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/contact">
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
      <section className="py-10 md:py-14 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-center">
            <div>
              <h2 className="font-serif text-3xl md:text-4xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
                Your Complete Apparel Business Partner
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 text-lg leading-relaxed mb-6">
                With more than 15 years of experience in the eCommerce, apparel manufacturing, and export industries, we have worked closely with businesses of all sizes to understand the challenges of product development, sourcing, branding, and online selling.
              </p>
              <p className="text-neutral-600 dark:text-neutral-300 text-lg leading-relaxed mb-8">
                Our experience has inspired us to build Tailorae as a complete solution for retailers, wholesalers, startups, fashion brands, corporate buyers, and entrepreneurs worldwide.
              </p>
              <div className="bg-white border-l-4 border-primary-500 p-4 rounded-r-lg">
                <h3 className="font-serif text-xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">Our Mission</h3>
                <p className="text-neutral-700 dark:text-neutral-300 italic">
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
      <section id="services" className="py-10 md:py-14 bg-white border-t border-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <Badge variant="primary" className="mb-4 text-sm font-medium px-4 py-1.5">What We Do</Badge>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-neutral-900 dark:text-neutral-50 mb-4">
              More Than Just a Manufacturer
            </h2>
            <p className="text-neutral-600 dark:text-neutral-300 text-lg max-w-2xl mx-auto">
              We are your complete apparel business partner — providing comprehensive solutions at every stage.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {services.map((service, index) => (
              <Card key={index} hover className="p-5 h-full">
                <div className="text-4xl mb-4">{service.icon}</div>
                <h3 className="font-serif text-xl font-bold text-neutral-900 dark:text-neutral-50 mb-3">
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
      <section className="py-10 md:py-14 bg-white border-t border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <Badge variant="secondary" className="mb-4 text-sm font-medium px-4 py-1.5">Why Choose Tailorae</Badge>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-neutral-900 dark:text-neutral-50 mb-4">
              Built on Trust, Driven by Excellence
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {whyChooseUs.map((item, index) => (
              <Card key={index} className="p-4 flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="font-medium text-neutral-900 dark:text-neutral-50">{item}</span>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Industries Section */}
      <section className="py-10 md:py-14 bg-white border-t border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <Badge variant="primary" className="mb-4 text-sm font-medium px-4 py-1.5">Industries We Serve</Badge>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-neutral-900 dark:text-neutral-50 mb-4">
              Supporting Businesses Across Industries
            </h2>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {industries.map((industry, index) => (
              <Badge key={index} variant="secondary" className="text-sm px-4 py-2">
                {industry}
              </Badge>
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
            <Link href="/contact">
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
