import type { ReactNode } from 'react';

export interface DocArticle {
  slug: string;
  title: string;
  section: string;
  summary: string;
  minutes: number;
  featured?: boolean;
  body: ReactNode;
}
