/** Copies text to the clipboard. Failures (permissions, insecure context) are ignored on purpose. */
export function copyToClipboard(text: string) {
  return navigator.clipboard?.writeText(text).catch(() => {});
}

/** Triggers a download of a plain-text file generated in the browser. */
export function downloadTextFile(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
