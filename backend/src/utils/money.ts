import Decimal from 'decimal.js';
export const CENT = new Decimal('0.01');
export function decimal(value: Decimal.Value): Decimal { return new Decimal(value); }
export function toNumber(value: Decimal.Value): number { return decimal(value).toNumber(); }
export function toCents(value: Decimal.Value): Decimal { return decimal(value).toDecimalPlaces(2); }
export function isDecimalLike(value: unknown): value is Decimal { return Decimal.isDecimal(value); }
export function jsonReplacer(_key: string, value: unknown): unknown { return isDecimalLike(value) ? value.toNumber() : value; }
