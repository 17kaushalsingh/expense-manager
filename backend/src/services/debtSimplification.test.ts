import {describe,it,expect} from 'vitest';
import {simplifyDebts} from './debtSimplification';
describe('debt simplification',()=>{
 it('settles a single cent',()=>expect(simplifyDebts({a:0.01,b:-0.01})).toEqual([{fromUserId:'b',toUserId:'a',amount:0.01}]));
 it('conserves every member balance',()=>{const balances={a:30.01,b:-10,c:-20.01};const remaining={...balances} as Record<string,number>;for(const d of simplifyDebts(balances)){remaining[d.fromUserId]+=d.amount;remaining[d.toUserId]-=d.amount;}expect(Object.values(remaining).every(n=>Math.abs(n)<0.001)).toBe(true);});
 it('returns no debts for settled groups',()=>expect(simplifyDebts({a:0,b:0})).toEqual([]));
});
