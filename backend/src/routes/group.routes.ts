import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { createGroupSchema,addGroupMemberSchema } from '../validation/schemas';
import { camelCase,dbResult,rpc } from '../db';
const router=Router();router.use(authenticate);
export async function loadGroups(req:AuthRequest,id?:string) {
 let q=req.db!.from('groups').select('*,members:group_members(*)').order('created_at');
 if(id) q=q.eq('id',id);
 const groups=dbResult(await q) ?? [];
 for(const group of groups) {
   const profiles=dbResult(await req.db!.rpc('group_member_profiles',{p_group_id:group.id})) ?? [];
   group.members=group.members.map((m: {user_id:string})=>({...m,user:profiles.find((p:{id:string})=>p.id===m.user_id)}));
 }
 return camelCase(groups);
}
router.get('/',async(req:AuthRequest,res)=>res.json(await loadGroups(req)));
router.post('/',validateBody(createGroupSchema),async(req:AuthRequest,res)=>res.status(201).json(await rpc(req.db!,'manage_group',{p_input:req.body})));
router.post('/:id/members',validateBody(addGroupMemberSchema),async(req:AuthRequest,res)=>res.status(201).json(await rpc(req.db!,'manage_group',{p_id:req.params.id,p_input:req.body,p_action:'ADD_MEMBER'})));
router.get('/:id/simplify-debts',async(req:AuthRequest,res)=>res.json(await rpc(req.db!,'simplify_debts',{p_group_id:req.params.id})));
export default router;
