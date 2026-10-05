'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Activity, BookOpen, LifeBuoy, MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/providers/auth-provider';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import { api, errorMessage } from '@/lib/api';
import type { AppHref } from '@/lib/routes';
import type { TicketPriority } from '@digitalycloud/shared';

const LINKS: { href: AppHref; icon: typeof BookOpen; title: string; desc: string }[] = [
  { href: '/docs', icon: BookOpen, title: 'Documentation', desc: 'Guides for bots, Node.js apps and APIs.' },
  { href: '/status', icon: Activity, title: 'System status', desc: 'Live health of every DIGITALY region.' },
  { href: '/docs/discord-bots', icon: MessageSquare, title: 'Discord bot guide', desc: 'Deploy your first bot in minutes.' },
];

const EMPTY = { subject: '', service: '', priority: 'normal', message: '' };

export function SupportView() {
  const { user } = useAuth();
  const { services } = useCloud();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const valid = form.subject.trim().length >= 4 && form.message.trim().length >= 10;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      const ticket = await api.support.createTicket({ subject: form.subject.trim(), serviceId: form.service || null, priority: form.priority as TicketPriority, message: form.message.trim() });
      setForm(EMPTY);
      toast({ kind: 'success', title: `Ticket #${ticket.number} created`, description: `We'll reply to ${user?.email} within a few hours.` });
    } catch (err) {
      toast({ kind: 'error', title: 'Ticket not sent', description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Support" description="Our team in Lyon usually replies within 2 hours on business days." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Panel title="Open a ticket" description="Tell us what's going on.">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label" htmlFor="ticket-subject">
                Subject
              </label>
              <input id="ticket-subject" className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="My bot goes offline every night" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ticket-service">
                  Service
                </label>
                <select id="ticket-service" className="input" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>
                  <option value="">Not service specific</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="ticket-priority">
                  Priority
                </label>
                <select id="ticket-priority" className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High — service is down</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="ticket-message">
                Message
              </label>
              <textarea
                id="ticket-message"
                className="input min-h-[160px] resize-y"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Include error messages or deployment numbers if you have them."
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={busy} disabled={!valid} icon={<Send className="h-4 w-4" />}>
                Send ticket
              </Button>
            </div>
          </form>
        </Panel>
        <div className="space-y-3">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="card card-hover flex items-start gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-brand-300">
                <l.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-white">{l.title}</p>
                <p className="text-xs text-ink-400">{l.desc}</p>
              </div>
            </Link>
          ))}
          <div className="card flex items-start gap-3 p-4">
            <LifeBuoy className="mt-0.5 h-5 w-5 text-aqua-400" />
            <p className="text-sm text-ink-300">
              Business plan customers get a priority line at <span className="text-white">support@digitaly.fr</span>.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
