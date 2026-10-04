import {
  Activity,
  BookOpen,
  Boxes,
  CreditCard,
  Globe,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Plus,
  Rocket,
  Server,
  Settings,
  ShieldHalf,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { PRODUCTS } from '@/data/products';
import type { AppHref } from '@/lib/routes';

export interface NavItem {
  href: AppHref;
  label: string;
}

export interface IconNavItem extends NavItem {
  icon: LucideIcon;
}

/** Public site header (after the Products mega menu). */
export const PUBLIC_NAV: NavItem[] = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Documentation' },
  { href: '/status', label: 'Status' },
];

export const FOOTER_COLUMNS: { title: string; links: NavItem[] }[] = [
  {
    title: 'Products',
    links: [...PRODUCTS.map((p): NavItem => ({ label: p.name, href: `/products/${p.slug}` })), { label: 'Pricing', href: '/pricing' }],
  },
  {
    title: 'Developers',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Deploy a bot', href: '/docs/discord-bots' },
      { label: 'API Reference', href: '/docs/api' },
      { label: 'Changelog', href: '/changelog' },
      { label: 'Status', href: '/status' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About DIGITALY', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Infrastructure', href: '/infrastructure' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Service', href: '/legal/terms' },
      { label: 'Privacy Policy', href: '/legal/privacy' },
      { label: 'Acceptable Use', href: '/legal/acceptable-use' },
    ],
  },
];

/** Dashboard sidebar. */
export const APP_NAV: IconNavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/services', label: 'Services', icon: Boxes },
  { href: '/deployments', label: 'Deployments', icon: Rocket },
  { href: '/servers', label: 'Servers', icon: Server },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/support', label: 'Support', icon: LifeBuoy },
  { href: '/settings', label: 'Settings', icon: Settings },
];

/** Public pages linked from the dashboard sidebar (open in a new tab). */
export const APP_RESOURCES: IconNavItem[] = [
  { href: '/docs', label: 'Documentation', icon: BookOpen },
  { href: '/pricing', label: 'Pricing', icon: Tag },
  { href: '/status', label: 'Status', icon: Activity },
];

/** Mobile bottom bar in the dashboard. */
export const BOTTOM_NAV: (IconNavItem & { primary?: boolean })[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/services', label: 'Services', icon: Boxes },
  { href: '/services/new', label: 'New', icon: Plus, primary: true },
  { href: '/deployments', label: 'Deploys', icon: Rocket },
  { href: '/billing', label: 'Billing', icon: CreditCard },
];

export interface AccountNavItem extends IconNavItem {
  external?: boolean;
}

/** Account menu on the public site. */
export const ACCOUNT_SITE_LINKS: AccountNavItem[] = [
  { href: '/services', label: 'My services', icon: Boxes },
  { href: '/billing', label: 'Billing & plans', icon: CreditCard },
  { href: '/settings', label: 'Account settings', icon: Settings },
  { href: '/support', label: 'Support', icon: LifeBuoy },
];

/** Account menu inside the dashboard. */
export const ACCOUNT_APP_LINKS: AccountNavItem[] = [
  { href: '/settings', label: 'Account settings', icon: Settings },
  { href: '/settings?tab=security', label: 'Security', icon: KeyRound },
  { href: '/billing', label: 'Billing & plans', icon: CreditCard },
  { href: '/support', label: 'Support', icon: LifeBuoy },
  { href: '/docs', label: 'Documentation', icon: BookOpen, external: true },
];

export const ACCOUNT_ADMIN_LINK: AccountNavItem = { href: '/admin', label: 'Control Center', icon: ShieldHalf };

export const ACCOUNT_QUICK_ACTIONS: Record<'site' | 'app', [AccountNavItem, AccountNavItem]> = {
  site: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/services/new', label: 'New service', icon: Plus },
  ],
  app: [
    { href: '/services/new', label: 'New service', icon: Plus },
    { href: '/', label: 'Website', icon: Globe },
  ],
};
