'use client';

import React, { useState } from 'react';
import { Card, Button } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [state, setState] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState(null);
    setSubmitting(true);
    try {
      await apiClient.post('/contact', form);
      setForm({ name: '', email: '', subject: '', message: '' });
      setState({ kind: 'success', message: 'Thanks — your message is with our team.' });
    } catch (error) {
      setState({ kind: 'error', message: getApiErrorMessage(error, 'Could not send your message. Please try again.') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="section-y">
      <div className="container-max contact-page">
        <header className="page-intro">
          <p>Customer care</p>
          <h1>Let’s make something exceptional.</h1>
          <span>Questions, project details, or a large order—we’re here to help.</span>
        </header>

        <div className="grid grid-cols-1 gap-px bg-line lg:grid-cols-2">
          {/* Contact Info */}
          <Card className="border-0 p-6 md:p-9">
            <h2 className="mb-8 text-2xl">Contact details</h2>
            <div className="space-y-7">
              <div>
                <h3 className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-3">Address</h3>
                <p className="text-ink-2">
                  123 Creative Lane<br />
                  Design City, DC 12345<br />
                  India
                </p>
              </div>
              <div>
                <h3 className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-3">Phone</h3>
                <p className="text-ink-2">+91 9876543210</p>
              </div>
              <div>
                <h3 className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-3">Email</h3>
                <p className="text-ink-2">info@creativeimpression.com</p>
              </div>
              <div>
                <h3 className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-3">Studio hours</h3>
                <p className="text-ink-2">
                  Monday - Friday: 9:00 AM - 6:00 PM<br />
                  Saturday: 10:00 AM - 4:00 PM<br />
                  Sunday: Closed
                </p>
              </div>
            </div>
          </Card>

          {/* Contact Form */}
          <Card className="border-0 p-6 md:p-9">
            <h2 className="mb-8 text-2xl">Send a message</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              {state && <p className={state.kind === 'success' ? 'alert alert-success' : 'alert alert-error'} role="status">{state.message}</p>}
              <div>
                <label className="mb-2 text-sm text-ink-2">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-2 text-sm text-ink-2">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-2 text-sm text-ink-2">
                  Subject
                </label>
                <input
                  type="text"
                  required
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-2 text-sm text-ink-2">
                  Message
                </label>
                <textarea
                  required
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="h-32 w-full"
                />
              </div>
              <Button type="submit" fullWidth variant="primary" size="lg" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send Message'}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </main>
  );
}
