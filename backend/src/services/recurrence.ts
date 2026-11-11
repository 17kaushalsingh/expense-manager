export function recurrenceDate(
  anchor: string,
  frequency: string,
  index: number,
): string | null {
  if (!Number.isInteger(index) || index < 0)
    throw new Error("Invalid occurrence index");
  if (frequency === "ONCE" && index > 0) return null;
  const date = new Date(`${anchor}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid anchor");
  const days = (
    { ONCE: 0, DAILY: 1, WEEKLY: 7, BIWEEKLY: 14 } as Record<string, number>
  )[frequency];
  if (days !== undefined) date.setUTCDate(date.getUTCDate() + days * index);
  else {
    const months = (
      { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 } as Record<string, number>
    )[frequency];
    if (!months) throw new Error("Invalid frequency");
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months * index);
    const last = new Date(date);
    last.setUTCMonth(last.getUTCMonth() + 1);
    last.setUTCDate(0);
    date.setUTCDate(Math.min(day, last.getUTCDate()));
  }
  return date.toISOString().slice(0, 10);
}
