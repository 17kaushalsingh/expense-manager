import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { createSplitExpense } from '../services/splitExpenseService';
import { createSplitExpenseSchema } from '../validation/schemas';

const router = Router();

router.post('/', authenticate, validateBody(createSplitExpenseSchema), async (req: AuthRequest, res: Response) => {
  try {
    const result = await createSplitExpense(req.body);
    res.status(201).json(result);
  } catch (error) {
    throw error;
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
