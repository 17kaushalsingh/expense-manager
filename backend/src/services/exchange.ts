import DecimalBase from "decimal.js";
const Decimal = DecimalBase.clone({ precision: 60 });
import { HttpError } from "../errors/httpError";
export const currencies = Intl.supportedValuesOf("currency").map((code) => ({
  code,
  minorUnits: new Intl.NumberFormat("en", {
    style: "currency",
    currency: code,
  }).resolvedOptions().maximumFractionDigits!,
}));
export function convertedAmount(
  amount: string | number,
  rate: string | number,
  currency: string,
) {
  const digits = currencies.find((c) => c.code === currency)?.minorUnits;
  const n = new Decimal(amount),
    r = new Decimal(rate);
  if (
    digits === undefined ||
    !n.isFinite() ||
    !r.isFinite() ||
    n.lte(0) ||
    r.lte(0) ||
    n.gte(1e12) ||
    r.gte(1e12)
  )
    throw new HttpError(400, "Invalid conversion");
  const result = n.mul(r).toDecimalPlaces(digits, Decimal.ROUND_HALF_UP);
  if (result.lte(0) || result.gte(1e12))
    throw new HttpError(400, "Converted amount is outside supported range");
  return result.toFixed(digits);
}
const cache = new Map<string, { expires: number; value: Quote }>();
export interface Quote {
  from: string;
  to: string;
  rate: string;
  date: string;
  provider: "Frankfurter";
  referenceOnly: true;
}
export async function exchangeQuote(
  from: string,
  to: string,
  date?: string,
): Promise<Quote> {
  if (
    ![from, to].every((c) => currencies.some((row) => row.code === c)) ||
    from === to ||
    (date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date > new Date().toISOString().slice(0, 10)))
  )
    throw new HttpError(
      400,
      "Choose distinct supported currencies and a past or current date",
    );
  const key = `${from}:${to}:${date ?? "latest"}`,
    hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  let response: Response;
  try {
    response = await fetch(
      `https://api.frankfurter.dev/v2/rate/${from.toLowerCase()}/${to.toLowerCase()}${date ? `?date=${date}` : ""}`,
      { signal: AbortSignal.timeout(7000), redirect: "error" },
    );
  } catch {
    throw new HttpError(
      503,
      "Reference rates unavailable. You can enter a reviewed manual rate.",
    );
  }
  if (!response.ok)
    throw new HttpError(
      response.status === 404 || response.status === 422 ? 422 : 503,
      "No reference rate available for this pair/date. Enter a reviewed manual rate.",
    );
  let row: { base: string; quote: string; date: string; rate: number };
  try {
    row = await response.json();
  } catch {
    throw new HttpError(503, "Invalid reference rate response");
  }
  if (
    !row ||
    typeof row.base !== "string" ||
    typeof row.quote !== "string" ||
    typeof row.date !== "string" ||
    typeof row.rate !== "number" ||
    !Number.isFinite(row.rate)
  )
    throw new HttpError(503, "Invalid reference rate response");
  const rate = new Decimal(String(row.rate));
  if (
    row.base?.toUpperCase() !== from ||
    row.quote?.toUpperCase() !== to ||
    !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
    row.date > (date ?? new Date().toISOString().slice(0, 10)) ||
    !rate.isFinite() ||
    rate.lte(0) ||
    rate.gte(1e12)
  )
    throw new HttpError(503, "Invalid reference rate response");
  const value: Quote = {
    from,
    to,
    rate: rate.toFixed(Math.min(16, rate.decimalPlaces())),
    date: row.date,
    provider: "Frankfurter",
    referenceOnly: true,
  };
  if (cache.size >= 512) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + 3600000, value });
  return value;
}
