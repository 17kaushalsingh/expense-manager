import {describe,it,expect} from 'vitest';
import {cashFlowSeries} from './cashFlow';
describe('cash flow',()=>{
 it('uses profile timezone and excludes transfer entries',()=>{
 const result=cashFlowSeries([{type:'EXPENSE',analytics_amount:'12.34',date_time:'2026-10-31T20:00:00Z'},{type:'INCOME',analytics_amount:'50.00',date_time:'2026-11-01T01:00:00Z'},{type:'TRANSFER',analytics_amount:100,date_time:'2026-11-01T01:00:00Z'}],'Asia/Kolkata',false,new Date('2026-10-31'),new Date('2026-11-02'));
 expect(result.totalExpense).toBe(12.34);expect(result.cashFlow).toBe(37.66);expect(result.series.find(b=>b.date==='2026-11-01')?.expense).toBe(12.34);
 });
 it('fills empty monthly buckets',()=>expect(cashFlowSeries([],'UTC',true,new Date('2026-01-01'),new Date('2026-03-31')).series.map(b=>b.date)).toEqual(['2026-01','2026-02','2026-03']));
});
