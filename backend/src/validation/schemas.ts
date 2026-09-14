import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const optionalString = z.string().trim().min(1).optional();
const optionalDate = z.coerce.date().optional();
const money = z.coerce.number().finite().positive();
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
  displayCurrency: optionalString,
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

export const updateAccountSchema = createAccountSchema.partial().refine(
  (body) => Object.keys(body).length > 0,
  'At least one account field is required'
);

export const createCategorySchema = z.object({
  name: nonEmptyString,
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
});

export const createGroupSchema = z.object({
  name: nonEmptyString,
  memberIds: z.array(nonEmptyString).optional(),
});

export const addGroupMemberSchema = z.object({
  userId: nonEmptyString,
});

export const createTransactionSchema = z.object({
  accountId: nonEmptyString,
  categoryId: nonEmptyString.nullable().optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  amount: money,
  dateTime: z.coerce.date(),
  tags: z.array(nonEmptyString).optional(),
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
  shareValue: z.coerce.number().finite().nonnegative().optional(),
});

export const createSplitExpenseSchema = z.object({
  groupId: nonEmptyString.nullable().optional(),
  description: nonEmptyString,
  totalAmount: money,
  splitType: z.enum(['EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES']),
  payers: z.array(z.object({ userId: nonEmptyString, amountPaid: money })).min(1),
  participants: z.array(splitPartySchema).min(1),
  date: optionalDate,
});

export const createSettlementSchema = z.object({
  payeeId: nonEmptyString,
  amount: money,
  accountId: nonEmptyString,
  date: optionalDate,
  notes: optionalString,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateSplitExpenseInput = z.infer<typeof createSplitExpenseSchema>;
export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
