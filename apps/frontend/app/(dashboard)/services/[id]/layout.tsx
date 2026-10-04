import type { Metadata } from 'next';
import { ServiceShell } from '@/components/services/detail/service-shell';

export const metadata: Metadata = { title: 'Service' };

export default async function ServiceLayout({ children, params }: LayoutProps<'/services/[id]'>) {
  const { id } = await params;
  return <ServiceShell id={id}>{children}</ServiceShell>;
}
