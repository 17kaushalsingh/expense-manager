import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all reminders for a user
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const reminders = await prisma.reminder.findMany({
      where: { userId: req.userId! },
      orderBy: { dueDate: 'asc' }
    });
    res.json(reminders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// Create a reminder
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { title, description, type, dueDate } = req.body;
  if (!title || !type || !dueDate) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const reminder = await prisma.reminder.create({
      data: {
        userId: req.userId!,
        title,
        description,
        type,
        dueDate: new Date(dueDate)
      }
    });
    res.status(201).json(reminder);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// Mark as completed
router.patch('/:id/complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const reminder = await prisma.reminder.update({
      where: { id: req.params.id as string, userId: req.userId! },
      data: { isCompleted: true, isRead: true }
    });
    res.json(reminder);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// Mark as read
router.patch('/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const reminder = await prisma.reminder.update({
      where: { id: req.params.id as string, userId: req.userId! },
      data: { isRead: true }
    });
    res.json(reminder);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// Delete a reminder
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.reminder.delete({
      where: { id: req.params.id as string, userId: req.userId! }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

export default router;
