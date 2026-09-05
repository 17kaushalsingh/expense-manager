import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Create Group
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { name, memberIds } = req.body;

  if (!name) {
    res.status(400).json({ error: 'Group name is required' });
    return;
  }

  try {
    const members = memberIds ? [req.userId, ...memberIds] : [req.userId];
    const uniqueMembers = [...new Set(members)] as string[];

    const group = await prisma.group.create({
      data: {
        name,
        members: {
          create: uniqueMembers.map(id => ({
            userId: id
          }))
        }
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } }
      }
    });

    res.status(201).json(group);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get User's Groups
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const groups = await prisma.group.findMany({
      where: {
        members: { some: { userId: req.userId } }
      },
      include: {
        members: { include: { user: { select: { id: true, name: true } } } }
      }
    });

    res.status(200).json(groups);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add Member to Group
router.post('/:id/members', authenticate, async (req: AuthRequest, res: Response) => {
  const { userId } = req.body;

  try {
    // verify group exists and current user is a member
    const group = await prisma.group.findFirst({
      where: { id: req.params.id as string, members: { some: { userId: req.userId } } }
    });

    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    const member = await prisma.groupMember.create({
      data: {
        groupId: req.params.id as string,
        userId: userId
      }
    });

    res.status(201).json(member);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
