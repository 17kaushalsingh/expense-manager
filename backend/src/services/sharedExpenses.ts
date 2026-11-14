import { z } from "zod";
/** API projections never disclose another member's private account/category IDs. */
export function visibleSplit<
  T extends {
    creator_id: string;
    category_id?: string | null;
    payers?: { user_id: string; account_id?: string }[];
  },
>(row: T, actor: string): T {
  return {
    ...row,
    ...(row.creator_id === actor ? {} : { category_id: null }),
    ...(row.payers
      ? {
          payers: row.payers.map((p) => {
            const { account_id, ...shared } = p;
            return p.user_id === actor ? p : shared;
          }),
        }
      : {}),
  } as T;
}
export const sharedFilters = z
  .object({
    q: z.string().trim().max(200).optional(),
    groupId: z.uuid().optional(),
    context: z.enum(["all", "group", "individual"]).default("all"),
    splitType: z
      .enum(["EQUAL", "EXACT", "PERCENTAGE", "SHARES", "ADJUSTMENT"])
      .optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    fromDate: z.iso.date().optional(),
    toDate: z.iso.date().optional(),
    minAmount: z.coerce.number().finite().nonnegative().optional(),
    maxAmount: z.coerce.number().finite().nonnegative().optional(),
    sort: z.enum(["newest", "oldest", "highest", "lowest"]).default("newest"),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
  })
  .refine(
    (f) => !f.fromDate || !f.toDate || f.fromDate <= f.toDate,
    "Start must precede end",
  )
  .refine(
    (f) =>
      f.minAmount === undefined ||
      f.maxAmount === undefined ||
      f.minAmount <= f.maxAmount,
    "Minimum must not exceed maximum",
  )
  .refine(
    (f) => !f.groupId || f.context !== "individual",
    "Group and individual filters conflict",
  );
export function visibleSplitResponse(value: unknown, actor: string): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as {
    creatorId: string;
    categoryId?: string | null;
    payers?: { userId: string; accountId?: string }[];
  };
  return {
    ...row,
    ...(row.creatorId === actor ? {} : { categoryId: null }),
    ...(row.payers
      ? {
          payers: row.payers.map((p) => {
            const { accountId, ...shared } = p;
            return p.userId === actor ? p : shared;
          }),
        }
      : {}),
  };
}
