import { pino, type Logger } from 'pino';

/**
 * Structured JSON logs. Redaction runs before serialization, so credentials, cookies, tokens,
 * passwords, env values and TOTP material never reach the log sink.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'req.headers["stripe-signature"]',
  'req.headers["x-hub-signature-256"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.secret',
  '*.challengeToken',
  '*.value',
  '*.env',
  '*.apiKey',
  '*.privateKey',
  '*.accessToken',
  '*.refreshToken',
  '*.clientSecret',
  // Redis client errors carry the failing command, e.g. AUTH with the password.
  'err.command',
  'err.config',
  'err.request',
  'err.response',
];

let root: Logger | null = null;

export function createLogger(level = process.env.LOG_LEVEL ?? 'info'): Logger {
  return pino({
    level,
    base: { service: 'digitalycloud', pid: process.pid },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: { err: pino.stdSerializers.err },
  });
}

export function logger(): Logger {
  root ??= createLogger();
  return root;
}

export function setLogger(l: Logger) {
  root = l;
}
