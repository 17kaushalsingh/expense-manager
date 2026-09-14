import { Prisma } from '@prisma/client';
import { HttpError } from '../errors/httpError';
import { prisma } from '../db';
import { CENT, decimal, toCents, toNumber } from '../utils/money';
import { CreateSplitExpenseInput } from '../validation/schemas';

type SplitParticipantWithAmount = CreateSplitExpenseInput['participants'][number] & {
  amountOwed: Prisma.Decimal;
};

function assertNearlyEqual(left: Prisma.Decimal, right: Prisma.Decimal, message: string) {
  if (left.minus(right).abs().greaterThan(CENT)) {
    throw new HttpError(400, message);
  }
}

export function calculateSplitParticipants(input: CreateSplitExpenseInput): SplitParticipantWithAmount[] {
  const totalAmount = decimal(input.totalAmount);

  if (input.splitType === 'EQUAL') {
    const splitAmount = toCents(totalAmount.div(input.participants.length));
    return input.participants.map((participant) => ({ ...participant, amountOwed: splitAmount }));
  }

  if (input.splitType === 'EXACT') {
    const participants = input.participants.map((participant) => ({
      ...participant,
      amountOwed: toCents(participant.shareValue ?? 0),
    }));
    const exactSum = participants.reduce((sum, participant) => sum.plus(participant.amountOwed), decimal(0));
    assertNearlyEqual(exactSum, totalAmount, 'Exact amounts do not sum up to total amount');
    return participants;
  }

  if (input.splitType === 'PERCENTAGE') {
    const pctSum = input.participants.reduce((sum, participant) => sum.plus(participant.shareValue ?? 0), decimal(0));
    assertNearlyEqual(pctSum, decimal(100), 'Percentages do not sum to 100');

    return input.participants.map((participant) => ({
      ...participant,
      amountOwed: toCents(totalAmount.mul(participant.shareValue ?? 0).div(100)),
    }));
  }

  const totalShares = input.participants.reduce((sum, participant) => sum.plus(participant.shareValue ?? 0), decimal(0));
  if (totalShares.lessThanOrEqualTo(0)) {
    throw new HttpError(400, 'Shares must be greater than zero');
  }

  return input.participants.map((participant) => ({
    ...participant,
    amountOwed: toCents(totalAmount.mul(participant.shareValue ?? 0).div(totalShares)),
  }));
}

async function getOrCreateVirtualAccount(
  tx: Prisma.TransactionClient,
  userId: string,
  type: string,
  name: string
) {
  const existing = await tx.account.findFirst({ where: { userId, type } });
  if (existing) return existing;

  return tx.account.create({ data: { userId, name, type } });
}

export async function createSplitExpense(input: CreateSplitExpenseInput) {
  const totalAmount = decimal(input.totalAmount);
  const totalPaid = input.payers.reduce((sum, payer) => sum.plus(payer.amountPaid), decimal(0));
  assertNearlyEqual(totalPaid, totalAmount, 'Total paid does not match total amount');

  const participants = calculateSplitParticipants(input);
  const allUserIds = new Set<string>([
    ...input.payers.map((payer) => payer.userId),
    ...input.participants.map((participant) => participant.userId),
  ]);

  return prisma.$transaction(async (tx) => {
    const splitExpense = await tx.splitExpense.create({
      data: {
        groupId: input.groupId,
        description: input.description,
        totalAmount: toNumber(totalAmount),
        splitType: input.splitType,
        date: input.date ?? new Date(),
        payers: {
          create: input.payers.map((payer) => ({
            userId: payer.userId,
            amountPaid: payer.amountPaid,
          })),
        },
        participants: {
          create: participants.map((participant) => ({
            userId: participant.userId,
            shareValue: participant.shareValue,
            amountOwed: toNumber(participant.amountOwed),
          })),
        },
      },
      include: { payers: true, participants: true },
    });

    for (const userId of allUserIds) {
      const paid = decimal(input.payers.find((payer) => payer.userId === userId)?.amountPaid ?? 0);
      const owed = participants.find((participant) => participant.userId === userId)?.amountOwed ?? decimal(0);

      const receivableAccount = await getOrCreateVirtualAccount(tx, userId, 'ACCOUNTS_RECEIVABLE', 'Receivables');
      const payableAccount = await getOrCreateVirtualAccount(tx, userId, 'ACCOUNTS_PAYABLE', 'Payables');
      const cashAccount = await getOrCreateVirtualAccount(tx, userId, 'CASH', 'Cash');

      if (paid.greaterThan(0)) {
        await tx.transaction.create({
          data: {
            userId,
            accountId: cashAccount.id,
            type: 'EXPENSE',
            amount: toNumber(paid),
            dateTime: input.date ?? new Date(),
            notes: `Paid for ${input.description}`,
          },
        });
        await tx.account.update({ where: { id: cashAccount.id }, data: { balance: { decrement: toNumber(paid) } } });

        if (owed.greaterThan(0)) {
          await tx.transaction.create({
            data: {
              userId,
              accountId: cashAccount.id,
              type: 'EXPENSE',
              amount: toNumber(owed),
              dateTime: input.date ?? new Date(),
              notes: `Personal share of ${input.description}`,
            },
          });
        }

        const net = paid.minus(owed);
        if (net.greaterThan(0)) {
          await tx.account.update({ where: { id: receivableAccount.id }, data: { balance: { increment: toNumber(net) } } });
        } else if (net.lessThan(0)) {
          await tx.account.update({ where: { id: payableAccount.id }, data: { balance: { increment: toNumber(net.abs()) } } });
        }
      } else if (owed.greaterThan(0)) {
        await tx.transaction.create({
          data: {
            userId,
            accountId: payableAccount.id,
            type: 'EXPENSE',
            amount: toNumber(owed),
            dateTime: input.date ?? new Date(),
            notes: `Owed for ${input.description}`,
          },
        });
        await tx.account.update({ where: { id: payableAccount.id }, data: { balance: { increment: toNumber(owed) } } });
      }
    }

    return splitExpense;
  });
}
