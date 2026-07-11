'use client';

import React from 'react';
import { Card, Button } from '@/components/common';

export default function ContactPage() {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Handle form submission
  };

  return (
    <main className="py-8 md:py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">Contact Us</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {/* Contact Info */}
          <Card className="p-8">
            <h2 className="text-2xl font-bold mb-6">Get in Touch</h2>
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-lg mb-2">📍 Address</h3>
                <p className="text-gray-600">
                  123 Creative Lane<br />
                  Design City, DC 12345<br />
                  India
                </p>
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2">📞 Phone</h3>
                <p className="text-gray-600">+91 9876543210</p>
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2">📧 Email</h3>
                <p className="text-gray-600">info@creativeimpression.com</p>
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2">⏰ Business Hours</h3>
                <p className="text-gray-600">
                  Monday - Friday: 9:00 AM - 6:00 PM<br />
                  Saturday: 10:00 AM - 4:00 PM<br />
                  Sunday: Closed
                </p>
              </div>
            </div>
          </Card>

          {/* Contact Form */}
          <Card className="p-8">
            <h2 className="text-2xl font-bold mb-6">Send us a Message</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  className="w-full border border-gray-300 rounded px-4 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  className="w-full border border-gray-300 rounded px-4 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subject
                </label>
                <input
                  type="text"
                  required
                  className="w-full border border-gray-300 rounded px-4 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message
                </label>
                <textarea
                  required
                  className="w-full border border-gray-300 rounded px-4 py-2 h-32"
                />
              </div>
              <Button type="submit" fullWidth variant="primary" size="lg">
                Send Message
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </main>
  );
}
