import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const optionalString = z.string().trim().min(1).optional();
const optionalDate = z.coerce.date().optional();
const money = z.coerce
  .number()
  .finite()
  .positive()
  .max(999999999999.99)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001,
    "Use at most two decimal places",
  );
const signedMoney = z.coerce.number().finite();
const jsonObject = z.record(z.string(), z.unknown());

export const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  name: nonEmptyString,
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const updateProfileSchema = z.object({
  displayCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  timezone: optionalString,
  name: optionalString,
});

export const createAccountSchema = z.object({
  name: nonEmptyString,
  type: nonEmptyString,
  currency: z.string().trim().min(1).nullable().optional(),
  balance: signedMoney.optional(),
  metadata: jsonObject.optional(),
});

export const updateAccountSchema = createAccountSchema
  .partial()
  .refine(
    (body) => Object.keys(body).length > 0,
    "At least one account field is required",
  );

export const createCategorySchema = z.object({
  name: nonEmptyString,
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  parentId: z.uuid().nullable().optional(),
});

export const createGroupSchema = z.object({
  name: nonEmptyString,
  memberIds: z.array(z.uuid()).optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
});

export const addGroupMemberSchema = z.object({
  userId: nonEmptyString,
});

export const createTransactionSchema = z.object({
  accountId: nonEmptyString,
  categoryId: nonEmptyString.nullable().optional(),
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: money,
  dateTime: z.coerce.date(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  notes: optionalString,
  attachments: z.array(nonEmptyString).optional(),
});

export const transferSchema = z.object({
  sourceAccountId: nonEmptyString,
  targetAccountId: nonEmptyString,
  amount: money,
  dateTime: z.coerce.date(),
  notes: optionalString,
});

const splitPartySchema = z.object({
  userId: nonEmptyString,
  shareValue: z.coerce.number().finite().optional(),
});

export const createSplitExpenseSchema = z.object({
  groupId: nonEmptyString.nullable().optional(),
  description: nonEmptyString,
  categoryId: z.uuid().nullable().optional(),
  totalAmount: money,
  splitType: z.enum(["EQUAL", "EXACT", "PERCENTAGE", "SHARES", "ADJUSTMENT"]),
  payers: z
    .array(
      z.object({
        userId: nonEmptyString,
        amountPaid: money,
        accountId: z.uuid().optional(),
      }),
    )
    .min(1),
  participants: z.array(splitPartySchema).min(1),
  date: optionalDate,
  itemization: z
    .object({
      items: z
        .array(
          z.object({
            label: z.string().trim().min(1).max(120),
            amount: money,
            participantIds: z.array(z.uuid()).min(1).max(50),
          }),
        )
        .min(1)
        .max(100),
      tax: z.number().finite().nonnegative().default(0),
      tip: z.number().finite().nonnegative().default(0),
      discount: z.number().finite().nonnegative().default(0),
    })
    .optional(),
});

export const createSettlementSchema = z.object({
  payeeId: z.uuid(),
  groupId: z.uuid().nullable().optional(),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]).optional(),
  amount: money,
  accountId: nonEmptyString,
  date: optionalDate,
  notes: optionalString,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateSplitExpenseInput = z.infer<typeof createSplitExpenseSchema>;
export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
