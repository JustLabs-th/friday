/** A date and time for the Scheduled tasks page; null means the task is paused and has no next run. */
export function formatDate(value: number | null, zone?: string) {
  return value === null
    ? 'Paused'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(value);
}
