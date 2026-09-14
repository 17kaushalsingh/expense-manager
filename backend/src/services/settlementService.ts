import { Prisma } from '@prisma/client';
import { HttpError } from '../errors/httpError';
import { prisma } from '../db';
import { decimal, toNumber } from '../utils/money';
import { CreateSettlementInput } from '../validation/schemas';

async function getOrCreateAccount(
  tx: Prisma.TransactionClient,
  userId: string,
  type: string,
  name: string
) {
  const existing = await tx.account.findFirst({ where: { userId, type } });
  if (existing) return existing;

  return tx.account.create({ data: { userId, name, type } });
}

export async function createSettlement(payerId: string, input: CreateSettlementInput) {
  const amount = decimal(input.amount);
  const amountNumber = toNumber(amount);
  const dateTime = input.date ?? new Date();

  return prisma.$transaction(async (tx) => {
    const payerAccount = await tx.account.findFirst({
      where: { id: input.accountId, userId: payerId },
    });
    if (!payerAccount) {
      throw new HttpError(404, 'Settlement account not found');
    }

    const payee = await tx.user.findUnique({ where: { id: input.payeeId }, select: { id: true } });
    if (!payee) {
      throw new HttpError(404, 'Payee not found');
    }

    await tx.account.update({
      where: { id: payerAccount.id },
      data: { balance: { decrement: amountNumber } },
    });

    await tx.transaction.create({
      data: {
        userId: payerId,
        accountId: payerAccount.id,
        type: 'TRANSFER',
        amount: amountNumber,
        dateTime,
        notes: input.notes || `Settlement payment to user ${input.payeeId}`,
      },
    });

    const payableAccount = await tx.account.findFirst({ where: { userId: payerId, type: 'ACCOUNTS_PAYABLE' } });
    if (payableAccount) {
      await tx.account.update({
        where: { id: payableAccount.id },
        data: { balance: { decrement: amountNumber } },
      });
    }

    const payeeCashAccount = await getOrCreateAccount(tx, input.payeeId, 'CASH', 'Cash');

    await tx.account.update({
      where: { id: payeeCashAccount.id },
      data: { balance: { increment: amountNumber } },
    });

    await tx.transaction.create({
      data: {
        userId: input.payeeId,
        accountId: payeeCashAccount.id,
        type: 'TRANSFER',
        amount: amountNumber,
        dateTime,
        notes: input.notes || `Settlement received from user ${payerId}`,
      },
    });

    const receivableAccount = await tx.account.findFirst({
      where: { userId: input.payeeId, type: 'ACCOUNTS_RECEIVABLE' },
    });
    if (receivableAccount) {
      await tx.account.update({
        where: { id: receivableAccount.id },
        data: { balance: { decrement: amountNumber } },
      });
    }
  });
}
