import type { Route } from 'next';
import Link from 'next/link';

const LOGO_SRC = '/DIGITALYCloud_Logo.png';

// The PNG is used as a mask so the mark picks up a brighter brand gradient that stays legible on dark surfaces.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      role="img"
      aria-hidden
      className="inline-block shrink-0 bg-linear-to-br/srgb from-brand-400 via-brand-500 to-azure-400 drop-shadow-[0_0_14px_rgba(37,99,255,0.45)] transition-transform duration-300 group-hover:scale-105"
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url(${LOGO_SRC})`,
        maskImage: `url(${LOGO_SRC})`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}

export function Logo({ href = '/', compact = false }: { href?: Route; compact?: boolean }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label="DIGITALYCloud home">
      <LogoMark size={34} />
      {!compact && (
        <span className="text-[17px] font-semibold tracking-tight text-white">
          DIGITALY<span className="text-gradient">Cloud</span>
        </span>
      )}
    </Link>
  );
}
