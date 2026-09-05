import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Create Account
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { name, type, currency, balance, metadata } = req.body;

  if (!name || !type) {
    res.status(400).json({ error: 'Name and type are required' });
    return;
  }

  try {
    const account = await prisma.account.create({
      data: {
        userId: req.userId as string,
        name,
        type,
        currency,
        balance: balance || 0.0,
        metadata: metadata || {}
      }
    });

    res.status(201).json(account);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all Accounts for User
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: req.userId }
    });

    res.status(200).json(accounts);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific Account
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.account.findFirst({
      where: { id: req.params.id as string, userId: req.userId }
    });

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    res.status(200).json(account);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Account
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { name, type, currency, balance, metadata } = req.body;

  try {
    // Verify ownership
    const account = await prisma.account.findFirst({
      where: { id: req.params.id as string, userId: req.userId }
    });

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const updatedAccount = await prisma.account.update({
      where: { id: req.params.id as string },
      data: {
        ...(name && { name }),
        ...(type && { type }),
        ...(currency !== undefined && { currency }),
        ...(balance !== undefined && { balance }),
        ...(metadata && { metadata })
      }
    });

    res.status(200).json(updatedAccount);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Account
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Verify ownership
    const account = await prisma.account.findFirst({
      where: { id: req.params.id as string, userId: req.userId }
    });

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    await prisma.account.delete({
      where: { id: req.params.id as string }
    });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
