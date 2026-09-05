import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Record a settlement (User pays a friend to settle debt)
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { payeeId, amount, accountId, date, notes } = req.body;

  if (!payeeId || !amount || !accountId) {
    res.status(400).json({ error: 'payeeId, amount, and accountId are required' });
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const payerId = req.userId as string;

      // Payer View:
      // Decrease selected bank account balance
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { decrement: amount } }
      });

      // Record outflow transaction
      await tx.transaction.create({
        data: {
          userId: payerId,
          accountId: accountId,
          type: 'TRANSFER',
          amount: amount,
          dateTime: date ? new Date(date) : new Date(),
          notes: notes || `Settlement payment to user ${payeeId}`,
        }
      });

      // Decrease Accounts Payable
      let payableAcc = await tx.account.findFirst({ where: { userId: payerId, type: 'ACCOUNTS_PAYABLE' } });
      if (payableAcc) {
        await tx.account.update({
          where: { id: payableAcc.id },
          data: { balance: { decrement: amount } }
        });
      }

      // Payee View:
      // In a real app, payee would approve or select which account received it.
      // We will default to their Cash account, or just increment Receivables down.
      let payeeCashAcc = await tx.account.findFirst({ where: { userId: payeeId, type: 'CASH' } });
      if (!payeeCashAcc) payeeCashAcc = await tx.account.create({ data: { userId: payeeId, name: 'Cash', type: 'CASH' }});

      await tx.account.update({
        where: { id: payeeCashAcc.id },
        data: { balance: { increment: amount } }
      });

      // Record inflow transaction
      await tx.transaction.create({
        data: {
          userId: payeeId,
          accountId: payeeCashAcc.id,
          type: 'TRANSFER',
          amount: amount,
          dateTime: date ? new Date(date) : new Date(),
          notes: notes || `Settlement received from user ${payerId}`,
        }
      });

      // Decrease Accounts Receivable
      let receivableAcc = await tx.account.findFirst({ where: { userId: payeeId, type: 'ACCOUNTS_RECEIVABLE' } });
      if (receivableAcc) {
        await tx.account.update({
          where: { id: receivableAcc.id },
          data: { balance: { decrement: amount } }
        });
      }
    });

    res.status(200).json({ message: 'Settlement recorded successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
