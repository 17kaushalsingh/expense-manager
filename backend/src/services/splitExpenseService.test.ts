import { describe, expect, it } from 'vitest';
import { HttpError } from '../errors/httpError';
import { toNumber } from '../utils/money';
import { calculateSplitParticipants } from './splitExpenseService';

describe('calculateSplitParticipants', () => {
  it('splits equal expenses across participants', () => {
    const participants = calculateSplitParticipants({
      description: 'Dinner',
      totalAmount: 90,
      splitType: 'EQUAL',
      payers: [{ userId: 'user-1', amountPaid: 90 }],
      participants: [
        { userId: 'user-1', shareValue: 1 },
        { userId: 'user-2', shareValue: 1 },
        { userId: 'user-3', shareValue: 1 },
      ],
    });

    expect(participants.map((participant) => toNumber(participant.amountOwed))).toEqual([30, 30, 30]);
  });

  it('calculates percentage splits', () => {
    const participants = calculateSplitParticipants({
      description: 'Hotel',
      totalAmount: 200,
      splitType: 'PERCENTAGE',
      payers: [{ userId: 'user-1', amountPaid: 200 }],
      participants: [
        { userId: 'user-1', shareValue: 25 },
        { userId: 'user-2', shareValue: 75 },
      ],
    });

    expect(participants.map((participant) => toNumber(participant.amountOwed))).toEqual([50, 150]);
  });

  it('rejects exact splits that do not match the total', () => {
    expect(() =>
      calculateSplitParticipants({
        description: 'Groceries',
        totalAmount: 100,
        splitType: 'EXACT',
        payers: [{ userId: 'user-1', amountPaid: 100 }],
        participants: [
          { userId: 'user-1', shareValue: 40 },
          { userId: 'user-2', shareValue: 50 },
        ],
      })
    ).toThrow(HttpError);
  });

  it('rejects share splits without any shares', () => {
    expect(() =>
      calculateSplitParticipants({
        description: 'Fuel',
        totalAmount: 100,
        splitType: 'SHARES',
        payers: [{ userId: 'user-1', amountPaid: 100 }],
        participants: [
          { userId: 'user-1', shareValue: 0 },
          { userId: 'user-2', shareValue: 0 },
        ],
      })
    ).toThrow('Shares must be greater than zero');
  });
});
