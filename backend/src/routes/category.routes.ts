import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Create Category
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { name, type } = req.body;

  if (!name || !type) {
    res.status(400).json({ error: 'Name and type are required' });
    return;
  }

  try {
    const category = await prisma.category.create({
      data: {
        userId: req.userId as string,
        name,
        type
      }
    });

    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Categories
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      where: {
        OR: [
          { userId: req.userId },
          { userId: null } // system categories
        ]
      }
    });

    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
