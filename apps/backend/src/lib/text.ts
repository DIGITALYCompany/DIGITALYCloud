/** Escapes text for a literal match inside a RegExp (user searches are never regex patterns). */
export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
