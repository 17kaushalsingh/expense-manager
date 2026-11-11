function atDay(month: string, day: number, shift = 0) {
  const d = new Date(`${month}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + shift);
  const last = new Date(d);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  d.setUTCDate(Math.min(day, last.getUTCDate()));
  return d;
}
export function cardCycle(month: string, statementDay: number, dueDay: number) {
  if (
    !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month) ||
    ![statementDay, dueDay].every(
      (n) => Number.isInteger(n) && n >= 1 && n <= 31,
    )
  )
    throw new Error("Invalid card cycle");
  const end = atDay(month, statementDay),
    start = atDay(month, statementDay, -1);
  start.setUTCDate(start.getUTCDate() + 1);
  let due = atDay(month, dueDay);
  if (due < end) due = atDay(month, dueDay, 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    due: due.toISOString().slice(0, 10),
  };
}
