/**
 * Transactional email templates (plain text first; minimal HTML). Links always point at
 * FRONTEND_URL, never at user-supplied hosts.
 */
export interface Rendered {
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, paragraphs: string[], action?: { label: string; url: string }): Rendered['html'] {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${esc(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${esc(action.url)}" style="background:#2563FF;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;display:inline-block">${esc(action.label)}</a></p><p style="color:#666;font-size:12px">${esc(action.url)}</p>`
    : '';
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;margin:auto;padding:24px"><h1 style="font-size:20px">${esc(title)}</h1>${body}${button}<p style="color:#888;font-size:12px;margin-top:32px">DIGITALYCloud · DIGITALY SAS, Lyon, France</p></body></html>`;
}

function render(title: string, paragraphs: string[], action?: { label: string; url: string }): Rendered {
  const text = [...paragraphs, ...(action ? [`${action.label}: ${action.url}`] : []), '', '— DIGITALYCloud'].join('\n\n');
  return { subject: title, text, html: layout(title, paragraphs, action) };
}

type Data = Record<string, string | number | null | undefined>;
const s = (v: unknown) => String(v ?? '');

export const TEMPLATES: Record<string, (d: Data) => Rendered> = {
  verify_email: (d) =>
    render('Verify your email address', [`Hi ${s(d.name)},`, 'Confirm this address to finish setting up your DIGITALYCloud account. The link expires in 24 hours.'], {
      label: 'Verify email',
      url: s(d.url),
    }),
  verify_new_email: (d) =>
    render('Confirm your new email address', [`Hi ${s(d.name)},`, 'You asked to use this address for your DIGITALYCloud account. Confirm it within 24 hours to complete the change.'], {
      label: 'Confirm new email',
      url: s(d.url),
    }),
  email_change_notice: (d) =>
    render('Your email address is changing', [`Hi ${s(d.name)},`, `Someone signed in to your account asked to change its email to ${s(d.newEmail)}. If this wasn’t you, reset your password right away.`]),
  password_reset: (d) =>
    render('Reset your password', [`Hi ${s(d.name)},`, 'Use the link below to choose a new password. It expires in one hour and works once. If you didn’t ask for this, you can ignore this email.'], {
      label: 'Reset password',
      url: s(d.url),
    }),
  password_changed: (d) => render('Your password was changed', [`Hi ${s(d.name)},`, 'Your DIGITALYCloud password was just changed and other sessions were signed out. If this wasn’t you, reset your password now.']),
  two_factor_disabled: (d) => render('Two-factor authentication was turned off', [`Hi ${s(d.name)},`, 'Two-factor authentication was disabled on your account. If this wasn’t you, reset your password and turn it back on.']),
  team_invitation: (d) =>
    render(`Join ${s(d.teamName)} on DIGITALYCloud`, [`${s(d.inviterName)} invited you to join ${s(d.teamName)} as ${s(d.role)}. The invitation expires in 7 days.`], {
      label: 'Accept invitation',
      url: s(d.url),
    }),
  notification: (d) => render(s(d.title), [s(d.body)], d.url ? { label: 'Open DIGITALYCloud', url: s(d.url) } : undefined),
  support_ticket_inbox: (d) =>
    render(`[Ticket #${s(d.number)}] ${s(d.subject)}`, [
      `From: ${s(d.userName)} <${s(d.userEmail)}> · Team ${s(d.teamId)}`,
      `Priority: ${s(d.priority)} · Service: ${s(d.serviceId) || 'none'}`,
      s(d.message),
    ]),
  support_ticket_copy: (d) =>
    render(`We received ticket #${s(d.number)}`, [`Hi ${s(d.name)},`, `Thanks for contacting us about “${s(d.subject)}”. Our team in Lyon usually replies within a few hours on business days.`, s(d.message)]),
  contact_inbox: (d) =>
    render(`[Contact] ${s(d.topic)} — ${s(d.name)}`, [`From: ${s(d.name)} <${s(d.email)}>${d.company ? ` · ${s(d.company)}` : ''}`, s(d.message)]),
  account_deletion: (d) =>
    render('Your account is being deleted', [`Hi ${s(d.name)},`, 'We received your request to delete your DIGITALYCloud account. Your services are being stopped and your data will be removed within 24 hours.']),
};

export type TemplateName = keyof typeof TEMPLATES;
