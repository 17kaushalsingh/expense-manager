import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { createTransactionSchema, transferSchema } from '../validation/schemas';
import { camelCase, dbResult, rpc } from '../db';
const router=Router();router.use(authenticate);
router.get('/',async(req:AuthRequest,res)=>{
 let q=req.db!.from('transactions').select('*,account:accounts(id,name,type,currency),category:categories(id,name)').order('date_time',{ascending:false});
 for(const [key,column] of Object.entries({type:'type',accountId:'account_id',categoryId:'category_id'})) if(typeof req.query[key]==='string') q=q.eq(column,req.query[key]);
 if(typeof req.query.from==='string') q=q.gte('date_time',req.query.from);
 if(typeof req.query.to==='string') q=q.lte('date_time',req.query.to);
 res.json(camelCase(dbResult(await q)));
});
router.post('/',validateBody(createTransactionSchema),async(req:AuthRequest,res)=>res.status(201).json(await rpc(req.db!,'mutate_transaction_atomic',{p_input:req.body})));
router.post('/transfer',validateBody(transferSchema),async(req:AuthRequest,res)=>res.json(await rpc(req.db!,'transfer_accounts_atomic',{p_input:req.body})));
export default router;
