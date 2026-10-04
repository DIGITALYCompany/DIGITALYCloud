import { cn } from '@/lib/utils';

const PIXELS = [
  { x: '6%', y: '22%', s: 28, filled: true, d: 0 },
  { x: '12%', y: '12%', s: 18, filled: false, d: 1.2 },
  { x: '3%', y: '40%', s: 36, filled: true, d: 0.6 },
  { x: '14%', y: '34%', s: 22, filled: false, d: 2 },
  { x: '90%', y: '18%', s: 24, filled: false, d: 0.4 },
  { x: '94%', y: '32%', s: 32, filled: true, d: 1.6 },
  { x: '84%', y: '28%', s: 16, filled: true, d: 2.4 },
];

// Echoes the pixel squares of the DIGITALYCloud mark.
export function PixelField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
      {PIXELS.map((p, i) => (
        <span
          key={i}
          className={cn(
            'absolute animate-float rounded-[6px]',
            p.filled ? 'bg-linear-to-br/srgb from-brand-500/50 to-azure-500/30 shadow-[0_0_24px_-4px_rgba(37,99,255,0.6)]' : 'border-2 border-brand-400/40'
          )}
          style={{ left: p.x, top: p.y, width: p.s, height: p.s, animationDelay: `${p.d}s` }}
        />
      ))}
    </div>
  );
}
