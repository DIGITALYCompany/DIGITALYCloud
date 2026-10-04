'use client';

import { useState, type FormEvent } from 'react';
import { Building2, CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/providers/toast-provider';
import { isValidEmail } from '@/lib/validation';

const TOPICS = ['Sales & dedicated resources', 'Technical question', 'Billing', 'Partnership', 'Press'];

const EMPTY = { name: '', email: '', company: '', topic: TOPICS[0], message: '' };

export function ContactForm() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const valid = form.name.trim().length >= 2 && isValidEmail(form.email) && form.message.trim().length >= 10;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    // No backend yet: simulate the request round-trip.
    await new Promise((r) => setTimeout(r, 900));
    setBusy(false);
    setSent(true);
    toast({ kind: 'success', title: 'Message sent', description: 'We usually reply within one business day.' });
  };

  return (
    <div className="card p-6 sm:p-8">
      {sent ? (
        <div className="flex h-full animate-fade-up flex-col items-center justify-center py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success-500/10 text-success-400">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h2 className="mt-5 text-xl font-semibold text-white">Thanks, {form.name.split(' ')[0]}!</h2>
          <p className="mt-2 max-w-sm text-sm text-ink-300">We received your message and will reply to {form.email} within one business day.</p>
          <Button
            variant="outline"
            className="mt-6"
            onClick={() => {
              setSent(false);
              setForm(EMPTY);
            }}
          >
            Send another message
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="contact-name">
                Full name
              </label>
              <input id="contact-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="contact-email">
                Work email
              </label>
              <input id="contact-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="contact-company">
                Company (optional)
              </label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input id="contact-company" className="input pl-9" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="contact-topic">
                Topic
              </label>
              <select id="contact-topic" className="input" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
                {TOPICS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="contact-message">
              Message
            </label>
            <textarea
              id="contact-message"
              className="input min-h-[180px] resize-y"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Tell us about your project..."
            />
          </div>
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!valid} icon={<Send className="h-4 w-4" />}>
            Send message
          </Button>
          <p className="text-center text-xs text-ink-500">By sending this form you agree to our privacy policy.</p>
        </form>
      )}
    </div>
  );
}
