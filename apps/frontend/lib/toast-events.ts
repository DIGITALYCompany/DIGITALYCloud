// Native events that started inside the toast viewport. Dialogs use this so that clicking a toast
// is not treated as a click outside the dialog. A DOM check is not enough: Radix evaluates outside
// clicks on `click`, after the toast's own click handler may already have removed it.
const toastEvents = new WeakSet<Event>();

export function markToastEvent(event: Event) {
  toastEvents.add(event);
}

export function isToastEvent(event: Event | undefined) {
  return event !== undefined && toastEvents.has(event);
}
