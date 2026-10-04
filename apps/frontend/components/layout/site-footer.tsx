import Link from 'next/link';
import { Github, Mail, MessageCircle } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { Dot } from '@/components/ui/badge';
import { FOOTER_COLUMNS } from '@/config/navigation';

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-ink-950">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-6">
          <div className="sm:col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-ink-300">Simple cloud hosting for your projects. Built and operated in France by DIGITALY.</p>
            <Link href="/status" className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-ink-200 transition hover:border-white/20">
              <Dot tone="success" pulse /> All systems operational
            </Link>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-medium text-white">{col.title}</h4>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-ink-400 transition hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-white/[0.06] pt-8 sm:flex-row sm:items-center">
          <p className="text-xs text-ink-400">© 2026 DIGITALY SAS · Lyon, France. All rights reserved.</p>
          <div className="flex gap-1 text-ink-400">
            <Link href="/contact" className="rounded-lg p-2 transition hover:bg-white/5 hover:text-white" aria-label="Contact">
              <Mail className="h-4 w-4" />
            </Link>
            <Link href="/contact#community" className="rounded-lg p-2 transition hover:bg-white/5 hover:text-white" aria-label="Community">
              <MessageCircle className="h-4 w-4" />
            </Link>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="rounded-lg p-2 transition hover:bg-white/5 hover:text-white" aria-label="GitHub">
              <Github className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
