import { Router, NextFunction, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { createSettlement } from '../services/settlementService';
import { createSettlementSchema } from '../validation/schemas';

const router = Router();

// Record a settlement (User pays a friend to settle debt)
router.post('/', authenticate, validateBody(createSettlementSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await createSettlement(req.userId as string, req.body);
    res.status(200).json({ message: 'Settlement recorded successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
