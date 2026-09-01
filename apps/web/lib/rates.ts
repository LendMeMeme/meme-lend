const YEAR_DAYS = 365;

export function formatApr(bps: number | null | undefined) {
  if (bps == null) return "Unavailable";
  return `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}% APR`;
}

export function periodRateFromApr(bps: number, days: number) {
  return (bps / 10_000) * (days / YEAR_DAYS);
}

export function formatPeriodEstimate(bps: number | null | undefined, days: number) {
  if (bps == null) return "Unavailable";
  const percent = periodRateFromApr(bps, days) * 100;
  return `${percent.toLocaleString(undefined, { maximumFractionDigits: 4 })}%`;
}

export function amountEstimate(amount: number, bps: number, days: number) {
  return amount * periodRateFromApr(bps, days);
}
