import { BookOpen, Compass, LifeBuoy, Lightbulb, Rocket, Settings2, Wrench, type LucideIcon } from 'lucide-react';

export const SECTION_META: Record<string, { icon: LucideIcon; blurb: string; tone: string }> = {
  Introduction: { icon: Compass, blurb: 'The essentials to get your first service online.', tone: 'text-brand-300 bg-brand-500/10 ring-brand-500/20' },
  Guides: { icon: Rocket, blurb: 'Step-by-step tutorials for each type of project.', tone: 'text-azure-400 bg-azure-500/10 ring-azure-500/20' },
  'Best practices': { icon: Lightbulb, blurb: 'Advice from our team to run faster, safer and cheaper.', tone: 'text-success-400 bg-success-500/10 ring-success-500/20' },
  Troubleshooting: { icon: Wrench, blurb: 'Diagnose and fix the most common problems.', tone: 'text-warning-400 bg-warning-500/10 ring-warning-500/20' },
  Configuration: { icon: Settings2, blurb: 'Variables, deployments and how your service is built.', tone: 'text-aqua-400 bg-aqua-500/10 ring-aqua-500/20' },
  Operations: { icon: BookOpen, blurb: 'Logs, automation and the REST API.', tone: 'text-ink-200 bg-white/[0.06] ring-white/10' },
  Account: { icon: LifeBuoy, blurb: 'Billing, invoices and team access.', tone: 'text-ink-200 bg-white/[0.06] ring-white/10' },
};
