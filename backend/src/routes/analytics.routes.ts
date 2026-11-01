import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { dbResult } from '../db';
import { decimal } from '../utils/money';
const router=Router();router.use(authenticate);
router.get('/net-worth',async(req:AuthRequest,res)=>{
 const accounts=dbResult(await req.db!.from('accounts').select('type,balance')) ?? [];
 const breakdown={assets:0,liabilities:0,receivables:0,payables:0};
 for(const a of accounts) {const key=a.type==='ACCOUNTS_RECEIVABLE'?'receivables':a.type==='ACCOUNTS_PAYABLE'?'payables':['CREDIT_CARD','LOAN'].includes(a.type)?'liabilities':'assets';breakdown[key]=decimal(breakdown[key]).plus(a.balance).toNumber();}
 res.json({netWorth:decimal(breakdown.assets).plus(breakdown.receivables).minus(breakdown.liabilities).minus(breakdown.payables).toNumber(),breakdown});
});
router.get('/debt-summary',async(req:AuthRequest,res)=>{
 const accounts=dbResult(await req.db!.from('accounts').select('type,balance').in('type',['ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE'])) ?? [];
 const sum=(type:string)=>accounts.filter(a=>a.type===type).reduce((n,a)=>n.plus(a.balance),decimal(0)).toNumber();
 res.json({totalOwedToYou:sum('ACCOUNTS_RECEIVABLE'),totalYouOwe:sum('ACCOUNTS_PAYABLE')});
});
router.get('/cash-flow',async(req:AuthRequest,res)=>{
 const rows=dbResult(await req.db!.from('transactions').select('type,analytics_amount,date_time').gt('analytics_amount',0)) ?? [];
 let income=decimal(0),expense=decimal(0);
 for(const row of rows) if(row.type==='INCOME') income=income.plus(row.analytics_amount);else if(row.type==='EXPENSE') expense=expense.plus(row.analytics_amount);
 res.json({totalIncome:income.toNumber(),totalExpense:expense.toNumber(),cashFlow:income.minus(expense).toNumber()});
});
export default router;
