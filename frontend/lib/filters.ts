export type DateFilter = 'all' | 'today' | '3d' | '7d';

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when `dateStr` falls inside the selected rolling window. */
export function withinDateFilter(dateStr: string | null, filter: DateFilter): boolean {
  if (filter === 'all' || !dateStr) return true;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return true;
  if (filter === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return t >= start.getTime();
  }
  const days = filter === '3d' ? 3 : 7;
  return t >= Date.now() - days * DAY_MS;
}
