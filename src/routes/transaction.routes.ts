import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Create Transaction
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { accountId, categoryId, type, amount, dateTime, tags, notes, attachments } = req.body;

  if (!accountId || !type || amount === undefined || !dateTime) {
    res.status(400).json({ error: 'accountId, type, amount, and dateTime are required' });
    return;
  }

  try {
    // Verify account belongs to user
    const account = await prisma.account.findFirst({ where: { id: accountId, userId: req.userId } });
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const transaction = await prisma.transaction.create({
      data: {
        userId: req.userId as string,
        accountId,
        categoryId,
        type,
        amount,
        dateTime: new Date(dateTime),
        tags: tags || [],
        notes,
        attachments: attachments || []
      }
    });

    // Update account balance
    let balanceChange = 0;
    if (type === 'INCOME') balanceChange = amount;
    else if (type === 'EXPENSE') balanceChange = -amount;

    if (balanceChange !== 0) {
      await prisma.account.update({
        where: { id: accountId },
        data: { balance: { increment: balanceChange } }
      });
    }

    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all transactions
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.userId },
      orderBy: { dateTime: 'desc' },
      include: {
        account: { select: { id: true, name: true, type: true } },
        category: { select: { id: true, name: true } }
      }
    });

    res.status(200).json(transactions);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Transfer between accounts (FR-2.2)
router.post('/transfer', authenticate, async (req: AuthRequest, res: Response) => {
  const { sourceAccountId, targetAccountId, amount, dateTime, notes } = req.body;

  if (!sourceAccountId || !targetAccountId || !amount || !dateTime) {
    res.status(400).json({ error: 'sourceAccountId, targetAccountId, amount, and dateTime are required' });
    return;
  }

  try {
    // Verify accounts
    const sourceAccount = await prisma.account.findFirst({ where: { id: sourceAccountId, userId: req.userId } });
    const targetAccount = await prisma.account.findFirst({ where: { id: targetAccountId, userId: req.userId } });

    if (!sourceAccount || !targetAccount) {
      res.status(404).json({ error: 'Source or target account not found' });
      return;
    }

    // Execute transfer in a transaction
    await prisma.$transaction(async (prisma) => {
      // 1. Create expense transaction on source
      await prisma.transaction.create({
        data: {
          userId: req.userId as string,
          accountId: sourceAccountId,
          type: 'TRANSFER',
          amount: amount,
          dateTime: new Date(dateTime),
          notes: notes || `Transfer to ${targetAccount.name}`,
        }
      });
      // 2. Create income transaction on target
      await prisma.transaction.create({
        data: {
          userId: req.userId as string,
          accountId: targetAccountId,
          type: 'TRANSFER',
          amount: amount,
          dateTime: new Date(dateTime),
          notes: notes || `Transfer from ${sourceAccount.name}`,
        }
      });
      
      // 3. Update balances
      await prisma.account.update({
        where: { id: sourceAccountId },
        data: { balance: { decrement: amount } }
      });
      await prisma.account.update({
        where: { id: targetAccountId },
        data: { balance: { increment: amount } }
      });
    });

    res.status(200).json({ message: 'Transfer successful' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
