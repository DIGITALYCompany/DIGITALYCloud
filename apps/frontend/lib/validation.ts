const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string) {
  return EMAIL_RE.test(value);
}

/** Only allow same-origin, path-relative redirects (prevents open redirects via `?from=`). */
export function safeRedirectPath(value: string | null | undefined, fallback: string) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}
