import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { createCategorySchema } from '../validation/schemas';
import { camelCase, dbResult } from '../db';
const router=Router();router.use(authenticate);
router.get('/',async(req:AuthRequest,res)=>res.json(camelCase(dbResult(await req.db!.from('categories').select('*').order('name')))));
router.post('/',validateBody(createCategorySchema),async(req:AuthRequest,res)=>res.status(201).json(camelCase(dbResult(await req.db!.from('categories').insert({...req.body,user_id:req.userId}).select().single()))));
export default router;
