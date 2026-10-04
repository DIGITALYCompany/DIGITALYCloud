import { ButtonLink } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Closing call to action used at the bottom of company pages. */
export function CtaSection({ title, description, headingClassName }: { title: string; description: string; headingClassName?: string }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
      <h2 className={cn('text-3xl font-semibold tracking-tight text-white sm:text-4xl', headingClassName)}>{title}</h2>
      <p className="mx-auto mt-4 max-w-lg text-ink-300">{description}</p>
      <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
        <ButtonLink href="/signup" size="lg">
          Start hosting
        </ButtonLink>
        <ButtonLink href="/contact" size="lg" variant="outline">
          Contact us
        </ButtonLink>
      </div>
    </section>
  );
}
