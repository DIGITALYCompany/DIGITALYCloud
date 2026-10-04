'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyToClipboard } from '@/lib/browser';

export function CodeBlock({ code, lang = 'bash', title }: { code: string; lang?: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="group my-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#070A12]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <span className="font-mono text-xs text-ink-400">{title ?? lang}</span>
        <button onClick={copy} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-400 transition hover:bg-white/5 hover:text-white">
          {copied ? <Check className="h-3.5 w-3.5 text-success-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-ink-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}
