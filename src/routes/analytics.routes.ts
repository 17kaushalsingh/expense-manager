import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// FR-6.1 Consolidated Net Worth
router.get('/net-worth', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: req.userId }
    });

    let assets = 0;
    let liabilities = 0;
    let receivables = 0;
    let payables = 0;

    for (const acc of accounts) {
      if (['CASH', 'BANK_ACCOUNT', 'PREPAID_CARD', 'INVESTMENT'].includes(acc.type)) {
        assets += acc.balance;
      } else if (['CREDIT_CARD', 'LOAN'].includes(acc.type)) {
        liabilities += acc.balance; // assuming balance is positive number for liability
      } else if (acc.type === 'ACCOUNTS_RECEIVABLE') {
        receivables += acc.balance;
      } else if (acc.type === 'ACCOUNTS_PAYABLE') {
        payables += acc.balance;
      }
    }

    const netWorth = (assets + receivables) - (liabilities + payables);

    res.status(200).json({
      netWorth,
      breakdown: { assets, liabilities, receivables, payables }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// FR-6.2 Cash Flow Analysis
router.get('/cash-flow', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: {
        userId: req.userId,
        type: { in: ['INCOME', 'EXPENSE'] }
      }
    });

    let totalIncome = 0;
    let totalExpense = 0;

    for (const txn of transactions) {
      if (txn.type === 'INCOME') totalIncome += txn.amount;
      else if (txn.type === 'EXPENSE') totalExpense += txn.amount;
    }

    res.status(200).json({
      cashFlow: totalIncome - totalExpense,
      totalIncome,
      totalExpense
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// FR-6.3 Group Debt Summary (Who owes you vs Who you owe)
// This pulls from the exact records of split expenses
router.get('/debt-summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // A more complex query could be used here to dynamically calculate pairwise debts.
    // For simplicity, we just return the total Receivables and Payables accounts.
    const accounts = await prisma.account.findMany({
      where: {
        userId: req.userId,
        type: { in: ['ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE'] }
      }
    });

    const summary = {
      totalOwedToYou: accounts.find(a => a.type === 'ACCOUNTS_RECEIVABLE')?.balance || 0,
      totalYouOwe: accounts.find(a => a.type === 'ACCOUNTS_PAYABLE')?.balance || 0
    };

    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
