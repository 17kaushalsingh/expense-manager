import { HttpError } from "../errors/httpError";
import { z } from "zod";
import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createGroupSchema, addGroupMemberSchema } from "../validation/schemas";
import { camelCase, dbResult, rpc } from "../db";
const router = Router();
router.use(authenticate);
export async function loadGroups(req: AuthRequest, id?: string) {
  let q = req
    .db!.from("groups")
    .select("*,members:group_members(*)")
    .order("created_at");
  if (id) q = q.eq("id", id);
  const groups = dbResult(await q) ?? [];
  const result = [];
  for (const group of groups) {
    const profiles =
      dbResult(
        await req.db!.rpc("group_member_profiles", { p_group_id: group.id }),
      ) ?? [];
    group.members = group.members.map((m) => ({
      ...m,
      user: profiles.find((p: { id: string }) => p.id === m.user_id),
    }));
    const graph = dbResult(
      await req.db!.rpc("simplify_debts", { p_group_id: group.id }),
    ) as unknown as { groupBalances: Record<string, number> };
    result.push({
      ...group,
      my_balance: Number(graph.groupBalances?.[req.userId!] ?? 0),
    });
  }
  return camelCase(result);
}
router.get("/", async (req: AuthRequest, res) =>
  res.json(await loadGroups(req)),
);
router.post(
  "/",
  validateBody(createGroupSchema),
  async (req: AuthRequest, res) =>
    res
      .status(201)
      .json(await rpc(req.db!, "manage_group", { p_input: req.body })),
);
router.post(
  "/:id/members",
  validateBody(addGroupMemberSchema),
  async (req: AuthRequest, res) =>
    res.status(201).json(
      await rpc(req.db!, "manage_group", {
        p_id: req.params.id,
        p_input: req.body,
        p_action: "ADD_MEMBER",
      }),
    ),
);
router.get("/:id/simplify-debts", async (req: AuthRequest, res) =>
  res.json(await rpc(req.db!, "simplify_debts", { p_group_id: req.params.id })),
);
router.get("/:id", async (req: AuthRequest, res) => {
  const groups = (await loadGroups(req, req.params.id as string)) as unknown[];
  if (!groups.length) throw new HttpError(404, "Group not found");
  res.json(groups[0]);
});
router.put(
  "/:id",
  validateBody(z.object({ name: z.string().trim().min(1) })),
  async (req: AuthRequest, res) =>
    res.json(
      await rpc(req.db!, "manage_group", {
        p_id: req.params.id,
        p_input: req.body,
      }),
    ),
);
router.delete("/:id", async (req: AuthRequest, res) => {
  await rpc(req.db!, "manage_group", {
    p_id: req.params.id,
    p_input: {},
    p_action: "DELETE",
  });
  res.status(204).send();
});
router.delete("/:groupId/members/:userId", async (req: AuthRequest, res) => {
  await rpc(req.db!, "manage_group", {
    p_id: req.params.groupId,
    p_input: { userId: req.params.userId },
    p_action: "REMOVE_MEMBER",
  });
  res.status(204).send();
});
export default router;
