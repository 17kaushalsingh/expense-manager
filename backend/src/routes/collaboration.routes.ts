import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { camelCase, dbResult, rpc } from "../db";
import { HttpError } from "../errors/httpError";
const router = Router();
router.use(authenticate);
const comment = z.object({ body: z.string().trim().min(1).max(2000) }).strict();
router.get("/groups/:id/activity", async (req: AuthRequest, res) => {
  const page = z
    .object({ offset: z.coerce.number().int().min(0).max(100000).default(0) })
    .safeParse(req.query);
  if (!page.success) throw new HttpError(400, "Invalid activity offset");
  const result = await req
    .db!.from("group_activity")
    .select("*", { count: "exact" })
    .eq("group_id", req.params.id as string)
    .order("created_at", { ascending: false })
    .order("id")
    .range(page.data.offset, page.data.offset + 24);
  res.json({ items: camelCase(dbResult(result)), total: result.count ?? 0 });
});
router.get("/splits/:id/comments", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("split_comments")
          .select("*")
          .eq("split_expense_id", req.params.id as string)
          .order("created_at")
          .order("id"),
      ),
    ),
  ),
);
router.post(
  "/splits/:id/comments",
  validateBody(comment),
  async (req: AuthRequest, res) =>
    res
      .status(201)
      .json(
        await rpc(req.db!, "mutate_split_comment", {
          p_split_id: req.params.id,
          p_body: req.body.body,
        }),
      ),
);
router.put(
  "/comments/:id",
  validateBody(comment),
  async (req: AuthRequest, res) =>
    res.json(
      await rpc(req.db!, "mutate_split_comment", {
        p_id: req.params.id,
        p_body: req.body.body,
      }),
    ),
);
router.delete("/comments/:id", async (req: AuthRequest, res) => {
  await rpc(req.db!, "mutate_split_comment", {
    p_id: req.params.id,
    p_delete: true,
  });
  res.status(204).send();
});
export default router;
