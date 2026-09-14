import { Router, NextFunction, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { createSettlement } from '../services/settlementService';
import { createSettlementSchema } from '../validation/schemas';

import { prisma } from '../db';

const router = Router();

// Record a settlement (User pays a friend to settle debt)
router.post('/', authenticate, validateBody(createSettlementSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const settlement = await createSettlement(req.userId as string, req.body);
    res.status(200).json(settlement);
  } catch (error) {
    next(error);
  }
});

// Get settlements involving the user
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const settlements = await prisma.settlement.findMany({
      where: {
        OR: [
          { payerId: req.userId },
          { payeeId: req.userId }
        ]
      },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        payee: { select: { id: true, name: true, email: true } }
      },
      orderBy: { date: 'desc' }
    });
    res.status(200).json(settlements);
  } catch (error) {
    next(error);
  }
});

export default router;
