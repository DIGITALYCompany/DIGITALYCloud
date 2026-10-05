/** Validation rules and the user-facing messages the UI and API both show. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const SERVICE_NAME_RE = /^[A-Za-z][\w-]{1,31}$/;
export const ENV_KEY_RE = /^[A-Z_][A-Z0-9_]*$/;
export const GITHUB_REPO_RE = /^[\w.-]+\/[\w.-]+$/;
/** Git branch names we accept (a conservative subset of `git check-ref-format`). */
export const GIT_BRANCH_RE = /^(?!\/|.*\/\/|.*\.\.|.*@\{|.*\.lock$|.*\/$)[\w./-]{1,255}$/;
export const RESERVED_ENV_PREFIX = 'DIGITALY_';
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;

export const MESSAGES = {
  name: 'Please enter your full name.',
  email: 'Enter a valid email address.',
  password: 'Password must be at least 8 characters.',
  passwordTooLong: 'Password must be at most 256 characters.',
  credentials: 'Incorrect email or password.',
  emailTaken: 'An account with this email already exists.',
  serviceName: 'Use 2–32 letters, numbers, dashes or underscores, starting with a letter.',
  serviceNameTaken: 'You already have a service with this name.',
  repo: 'Enter a repository like username/repo.',
  branch: 'Enter a valid branch name.',
  dockerImage: 'Enter a Docker image name.',
  upload: 'Upload a .zip of your project.',
  startCommand: 'A start command is required.',
  port: 'Port must be between 1 and 65535.',
  portRequired: 'Web services need a port.',
  unknownRegion: 'Unknown region.',
  envKey: 'Keys must use uppercase letters, numbers and underscores.',
  envReserved: 'Keys starting with DIGITALY_ are reserved by the platform.',
  apiKeyName: 'Give the key a name of at least 2 characters.',
  ticketSubject: 'The subject needs at least 4 characters.',
  ticketMessage: 'The message needs at least 10 characters.',
  contactMessage: 'The message needs at least 10 characters.',
  reset: 'This reset link is invalid or has expired.',
  verification: 'This verification link is invalid or has expired.',
  invitation: 'This invitation is invalid or has expired.',
  code: 'That code is not valid.',
  notSignedIn: 'Not signed in',
  forbidden: 'You don’t have permission to do that.',
  internal: 'Something went wrong. Please try again.',
} as const;

/**
 * Normalises an email for uniqueness checks: trims and lowercases the whole address.
 * No provider-specific rewriting (dots, plus-addressing) is applied.
 */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const isValidEmail = (value: string) => EMAIL_RE.test(value) && value.length <= 254;

/** Only same-origin, path-relative redirects (prevents open redirects via `?from=`). */
export function safeRedirectPath(value: string | null | undefined, fallback: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}

/** Name split rules from the data model: first word, and up to two initials. */
export function nameParts(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '';
  return { firstName: first, avatarInitials: ((first[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() };
}

/** Service id (public slug) derived from a name; the server appends `-xxxx` on collision. */
export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)
    .replace(/-$/, '');
}

/**
 * Docker image references (`[registry/]name[:tag][@sha256:digest]`), following the
 * distribution reference grammar closely enough to reject anything unusual.
 */
export const DOCKER_IMAGE_RE =
  /^(?:(?<registry>(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?))*(?::[0-9]{1,5})?)\/)?(?<path>[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*)(?::(?<tag>[\w][\w.-]{0,127}))?(?:@(?<digest>sha256:[a-f0-9]{64}))?$/;

export function parseDockerImage(ref: string) {
  const m = DOCKER_IMAGE_RE.exec(ref.trim());
  if (!m?.groups) return null;
  let registry: string | undefined = m.groups.registry;
  let path = m.groups.path!;
  // `library/node` style refs: the first component is only a registry when it looks like a host.
  if (registry && !/[.:]/.test(registry) && registry !== 'localhost') {
    path = `${registry}/${path}`;
    registry = undefined;
  }
  return { registry: registry ?? 'docker.io', path, tag: m.groups.tag ?? (m.groups.digest ? undefined : 'latest'), digest: m.groups.digest };
}

export function isValidPort(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 65535;
}
