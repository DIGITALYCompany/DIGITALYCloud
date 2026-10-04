export function Avatar({ initials, size = 32 }: { initials: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-gradient-3 font-semibold text-white ring-2 ring-ink-950"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}
