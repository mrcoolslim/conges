/**
 * Default office calendar for Tunisia: Monday-Friday, excluding fixed national
 * holidays. Islamic holiday dates move each year and must be supplied from the
 * official annual announcement by the HR team when it is published.
 */
const FIXED_TUNISIAN_HOLIDAYS: Record<string, string> = {
  "01-01": "Nouvel An",
  "03-20": "Fête de l'Indépendance",
  "04-09": "Journée des Martyrs",
  "05-01": "Fête du Travail",
  "07-25": "Fête de la République",
  "08-13": "Fête de la Femme",
  "10-15": "Fête de l'Évacuation",
  "12-17": "Fête de la Révolution",
};

function toUtcDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function countTunisianWorkingDays(
  startDate: string,
  endDate: string,
  halfDay: "NONE" | "MORNING" | "AFTERNOON" = "NONE",
  additionalHolidays: string[] = [],
): number {
  const start = toUtcDate(startDate);
  const end = toUtcDate(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  const holidays = new Set(additionalHolidays);
  let days = 0;
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const weekday = date.getUTCDay();
    const dateKey = date.toISOString().slice(0, 10);
    const monthDay = dateKey.slice(5);
    if (weekday === 0 || weekday === 6 || FIXED_TUNISIAN_HOLIDAYS[monthDay] || holidays.has(dateKey)) continue;
    days += 1;
  }

  return halfDay === "NONE" ? days : Math.max(0, days - 0.5);
}

/** 2.5 days accrue at the end of each completed calendar month of employment. */
export function accruedAnnualLeave(asOf = new Date(), hireDate?: string): number {
  const startOfYear = Date.UTC(asOf.getUTCFullYear(), 0, 1);
  const employmentStart = hireDate ? toUtcDate(hireDate) : new Date(startOfYear);
  if (employmentStart > asOf) return 0;
  const startsOnFirst = employmentStart.getUTCDate() === 1;
  const firstMonth = employmentStart.getUTCFullYear() < asOf.getUTCFullYear()
    ? 0
    : employmentStart.getUTCMonth() + (startsOnFirst ? 0 : 1);
  return Math.max(0, asOf.getUTCMonth() - firstMonth) * 2.5;
}
