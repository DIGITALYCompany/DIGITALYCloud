'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ThumbsDown, ThumbsUp } from 'lucide-react';

const BUTTON = 'inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-ink-200 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-white';

export function ArticleFeedback() {
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  if (vote) {
    return (
      <p className="animate-fade-in text-sm text-ink-300">
        {vote === 'up' ? 'Thanks for your feedback!' : 'Thanks — we’ll use this to improve the article.'}
        {vote === 'down' && (
          <Link href="/contact" className="ml-1 text-brand-300 hover:text-brand-200">
            Tell us what was missing
          </Link>
        )}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-ink-300">Was this article helpful?</span>
      <button type="button" className={BUTTON} onClick={() => setVote('up')}>
        <ThumbsUp className="h-3.5 w-3.5" /> Yes
      </button>
      <button type="button" className={BUTTON} onClick={() => setVote('down')}>
        <ThumbsDown className="h-3.5 w-3.5" /> No
      </button>
    </div>
  );
}
