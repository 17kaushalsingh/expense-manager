import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { groupId, description, totalAmount, splitType, payers, participants, date } = req.body;

  // Validate inputs
  if (!description || !totalAmount || !splitType || !payers || !participants) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  // Validate Payers match total
  const totalPaid = payers.reduce((sum: number, p: any) => sum + p.amountPaid, 0);
  if (Math.abs(totalPaid - totalAmount) > 0.01) {
    res.status(400).json({ error: 'Total paid does not match total amount' });
    return;
  }

  // Calculate shares based on splitType
  const calculatedParticipants = participants.map((p: any) => ({ ...p, amountOwed: 0 }));
  
  if (splitType === 'EQUAL') {
    const splitAmount = totalAmount / participants.length;
    calculatedParticipants.forEach((p: any) => p.amountOwed = splitAmount);
  } else if (splitType === 'EXACT') {
    let exactSum = 0;
    calculatedParticipants.forEach((p: any) => {
      p.amountOwed = p.shareValue || 0;
      exactSum += p.amountOwed;
    });
    if (Math.abs(exactSum - totalAmount) > 0.01) {
      res.status(400).json({ error: 'Exact amounts do not sum up to total amount' });
      return;
    }
  } else if (splitType === 'PERCENTAGE') {
    let pctSum = 0;
    calculatedParticipants.forEach((p: any) => {
      pctSum += p.shareValue || 0;
      p.amountOwed = (totalAmount * (p.shareValue || 0)) / 100;
    });
    if (Math.abs(pctSum - 100) > 0.01) {
      res.status(400).json({ error: 'Percentages do not sum to 100' });
      return;
    }
  } else if (splitType === 'SHARES') {
    const totalShares = calculatedParticipants.reduce((sum: number, p: any) => sum + (p.shareValue || 0), 0);
    calculatedParticipants.forEach((p: any) => {
      p.amountOwed = (totalAmount * (p.shareValue || 0)) / totalShares;
    });
  } else {
    res.status(400).json({ error: 'Unsupported split type' });
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create SplitExpense
      const splitExpense = await tx.splitExpense.create({
        data: {
          groupId,
          description,
          totalAmount,
          splitType,
          date: date ? new Date(date) : new Date(),
          payers: {
            create: payers.map((p: any) => ({
              userId: p.userId,
              amountPaid: p.amountPaid
            }))
          },
          participants: {
            create: calculatedParticipants.map((p: any) => ({
              userId: p.userId,
              shareValue: p.shareValue,
              amountOwed: p.amountOwed
            }))
          }
        },
        include: { payers: true, participants: true }
      });

      // 2. FR-5.1 Automated Ledger Mapping
      // For each user involved (either as payer or participant)
      const allUserIds = new Set<string>([...payers.map((p: any) => p.userId), ...participants.map((p: any) => p.userId)]);
      
      for (const uid of allUserIds) {
        const paid = payers.find((p: any) => p.userId === uid)?.amountPaid || 0;
        const owed = calculatedParticipants.find((p: any) => p.userId === uid)?.amountOwed || 0;
        
        // Find or create virtual accounts for this user (Receivable, Payable)
        let receivableAcc = await tx.account.findFirst({ where: { userId: uid, type: 'ACCOUNTS_RECEIVABLE' } });
        if (!receivableAcc) receivableAcc = await tx.account.create({ data: { userId: uid, name: 'Receivables', type: 'ACCOUNTS_RECEIVABLE' }});
        
        let payableAcc = await tx.account.findFirst({ where: { userId: uid, type: 'ACCOUNTS_PAYABLE' } });
        if (!payableAcc) payableAcc = await tx.account.create({ data: { userId: uid, name: 'Payables', type: 'ACCOUNTS_PAYABLE' }});
        
        // Default cash account for generic outflow (in reality, user would select which account they paid from)
        let cashAcc = await tx.account.findFirst({ where: { userId: uid, type: 'CASH' } });
        if (!cashAcc) cashAcc = await tx.account.create({ data: { userId: uid, name: 'Cash', type: 'CASH' }});

        // Payer View / Non-Payer View mapping
        if (paid > 0) {
          // User paid something
          // Cash Outflow
          await tx.transaction.create({
            data: { userId: uid, accountId: cashAcc.id, type: 'EXPENSE', amount: paid, dateTime: new Date(), notes: `Paid for ${description}` }
          });
          await tx.account.update({ where: { id: cashAcc.id }, data: { balance: { decrement: paid } } });

          // Personal Expense = amount owed
          if (owed > 0) {
            await tx.transaction.create({
              data: { userId: uid, accountId: cashAcc.id, type: 'EXPENSE', amount: owed, dateTime: new Date(), notes: `Personal share of ${description}` }
            });
            // we don't decrement balance again for the pure expense view here, 
            // the cash outflow transaction already handled the real balance drop.
            // Wait, this is a dual-ledger system. The actual balance is only decremented by the cash outflow.
            // We'll mark the personal expense for reporting purposes.
          }

          const net = paid - owed;
          if (net > 0) {
            // Accounts Receivable increases
            await tx.account.update({ where: { id: receivableAcc.id }, data: { balance: { increment: net } } });
          } else if (net < 0) {
             // Accounts Payable increases
            await tx.account.update({ where: { id: payableAcc.id }, data: { balance: { increment: Math.abs(net) } } });
          }
        } else {
          // User didn't pay, only participated
          // Personal Expense = amount owed
          // Accounts Payable = amount owed
          if (owed > 0) {
            // Record personal expense
            await tx.transaction.create({
              data: { userId: uid, accountId: payableAcc.id, type: 'EXPENSE', amount: owed, dateTime: new Date(), notes: `Owed for ${description}` }
            });
            await tx.account.update({ where: { id: payableAcc.id }, data: { balance: { increment: owed } } });
          }
        }
      }

      return splitExpense;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get group splits
router.get('/group/:groupId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const splits = await prisma.splitExpense.findMany({
      where: { groupId: req.params.groupId as string },
      include: { payers: true, participants: true }
    });
    res.status(200).json(splits);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
