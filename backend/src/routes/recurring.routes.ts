import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { rpc,camelCase,dbResult } from "../db";
import { createSplitExpenseSchema } from "../validation/schemas";
const router=Router();router.use(authenticate);
const day=z.iso.date();
const schedule=z.object({templateId:z.uuid(),frequency:z.enum(["WEEKLY","MONTHLY","YEARLY"]),startDate:day,endDate:day.nullable().optional(),timezone:z.string().min(1)}).strict();
const update=z.object({endDate:day.nullable().optional(),status:z.enum(["ACTIVE","PAUSED","ARCHIVED"]).optional()}).strict().refine(x=>Object.keys(x).length>0,"At least one field is required");
router.get("/schedules/groups/:groupId",async(req:AuthRequest,res)=>res.json(camelCase(dbResult(await req.db!.from("expense_schedules").select("*").eq("group_id",req.params.groupId as string).order("created_at",{ascending:false})))));
router.post("/schedules",validateBody(schedule),async(req:AuthRequest,res)=>res.status(201).json(await rpc(req.db!,"manage_expense_schedule",{p_input:req.body})));
router.put("/schedules/:id",validateBody(update),async(req:AuthRequest,res)=>res.json(await rpc(req.db!,"manage_expense_schedule",{p_id:req.params.id,p_input:req.body})));
router.get("/drafts",async(req:AuthRequest,res)=>{
 const parsed=z.uuid().optional().safeParse(req.query.groupId);
 if(!parsed.success){res.status(400).json({error:"Invalid group ID"});return;}
 const groupId=parsed.data;
 res.json(await rpc(req.db!,"list_expense_drafts",{p_group_id:groupId??null}));
});
router.put("/drafts/:id",validateBody(createSplitExpenseSchema.omit({categoryId:true,date:true}).strict()),async(req:AuthRequest,res)=>res.json(await rpc(req.db!,"mutate_expense_draft",{p_id:req.params.id,p_action:"UPDATE",p_input:req.body})));
router.post("/drafts/:id/post",validateBody(createSplitExpenseSchema),async(req:AuthRequest,res)=>res.json(await rpc(req.db!,"mutate_expense_draft",{p_id:req.params.id,p_action:"POST",p_input:req.body})));
router.post("/drafts/:id/skip",validateBody(z.object({}).strict()),async(req:AuthRequest,res)=>res.json(await rpc(req.db!,"mutate_expense_draft",{p_id:req.params.id,p_action:"SKIP"})));
export default router;
