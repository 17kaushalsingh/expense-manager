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

describe('cent conservation',()=>{
  for(const splitType of ['EQUAL','PERCENTAGE','SHARES'] as const) it(`conserves cents for ${splitType}`,()=>{
    const result=calculateSplitParticipants({description:'Odd cents',totalAmount:10,splitType,payers:[{userId:'a',amountPaid:10}],participants:[{userId:'a',shareValue:splitType==='PERCENTAGE'?33.3333:1},{userId:'b',shareValue:splitType==='PERCENTAGE'?33.3333:1},{userId:'c',shareValue:splitType==='PERCENTAGE'?33.3334:1}]});
    expect(result.reduce((n,p)=>n+Math.round(toNumber(p.amountOwed)*100),0)).toBe(1000);
    expect(toNumber(result[0].amountOwed)).toBe(3.34);
  });
  it('rejects duplicate participants',()=>expect(()=>calculateSplitParticipants({description:'Duplicate',totalAmount:10,splitType:'EQUAL',payers:[{userId:'a',amountPaid:10}],participants:[{userId:'a'},{userId:'a'}]})).toThrow('Duplicate'));
  it('accepts exact allocations',()=>expect(calculateSplitParticipants({description:'Exact',totalAmount:10,splitType:'EXACT',payers:[{userId:'a',amountPaid:10}],participants:[{userId:'a',shareValue:4},{userId:'b',shareValue:6}]}).map(p=>toNumber(p.amountOwed))).toEqual([4,6]));
});
