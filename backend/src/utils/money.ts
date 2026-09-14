import { Prisma } from '@prisma/client';

export const CENT = new Prisma.Decimal('0.01');

export function decimal(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function toNumber(value: Prisma.Decimal.Value): number {
  return decimal(value).toNumber();
}

export function toCents(value: Prisma.Decimal.Value): Prisma.Decimal {
  return decimal(value).toDecimalPlaces(2);
}

export function isDecimalLike(value: unknown): value is Prisma.Decimal {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.constructor?.name === 'Decimal' &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  );
}

export function jsonReplacer(_key: string, value: unknown): unknown {
  return isDecimalLike(value) ? value.toNumber() : value;
}
