import type { Metadata } from 'next';
import { NewServiceWizard } from '@/components/services/new-service-wizard';

export const metadata: Metadata = { title: 'New service' };

export default function NewServicePage() {
  return <NewServiceWizard />;
}
