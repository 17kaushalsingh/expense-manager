import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Get Profile
router.get('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Exclude passwordHash
    const { passwordHash, ...profile } = user;
    res.status(200).json(profile);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Profile (Currency & Timezone)
router.put('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  const { displayCurrency, timezone, name } = req.body;

  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(displayCurrency && { displayCurrency }),
        ...(timezone && { timezone }),
        ...(name && { name })
      }
    });

    const { passwordHash, ...profile } = user;
    res.status(200).json(profile);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
