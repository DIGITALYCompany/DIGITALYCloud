export const MAX_LINE_BYTES = 8 * 1024;
const MIN_SECRET_LENGTH = 4;

/**
 * Replaces secret values with `[redacted]`. Multi-line secrets are matched line by line. It runs on
 * complete lines only (see LineSplitter), so a secret split across two output chunks is still caught.
 */
export class Redactor {
  private readonly needles: string[];
  constructor(secrets: string[]) {
    const parts = new Set<string>();
    for (const s of secrets) for (const p of s.split(/\r?\n/)) if (p.length >= MIN_SECRET_LENGTH) parts.add(p);
    this.needles = [...parts].sort((a, b) => b.length - a.length);
  }
  redact(line: string) {
    let out = line;
    for (const n of this.needles) if (out.includes(n)) out = out.split(n).join('[redacted]');
    return out;
  }
}

/**
 * Splits a byte stream into lines, buffering partial lines across chunks. Lines longer than the
 * limit are cut (and marked) so one runaway line cannot exhaust memory.
 */
export class LineSplitter {
  private partial = '';
  constructor(private readonly onLine: (line: string) => void) {}
  push(chunk: Buffer | string) {
    const text = this.partial + (typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    const lines = text.split('\n');
    this.partial = lines.pop() ?? '';
    if (Buffer.byteLength(this.partial) > MAX_LINE_BYTES) {
      lines.push(`${this.partial.slice(0, MAX_LINE_BYTES)} …[line truncated]`);
      this.partial = '';
    }
    for (const l of lines) this.onLine(Buffer.byteLength(l) > MAX_LINE_BYTES ? `${l.slice(0, MAX_LINE_BYTES)} …[line truncated]` : l.replace(/\r$/, ''));
  }
  flush() {
    if (this.partial) this.onLine(this.partial);
    this.partial = '';
  }
}
