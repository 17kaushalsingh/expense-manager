import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { rpc } from "../db";
const router = Router();
router.use(authenticate);
const party = z
  .object({
    userId: z.uuid(),
    shareValue: z.number().finite().optional(),
  })
  .strict();
const template = z
  .object({
    name: z.string().trim().min(1).max(120),
    payload: z
      .object({
        description: z.string().trim().min(1),
        totalAmount: z.number().positive().nullable(),
        splitType: z.enum([
          "EQUAL",
          "EXACT",
          "PERCENTAGE",
          "SHARES",
          "ADJUSTMENT",
        ]),
        participants: z.array(party).min(1),
        payers: z
          .array(
            z
              .object({
                userId: z.uuid(),
                amountPaid: z.number().positive().optional(),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
  })
  .strict();
router.get("/groups/:groupId", async (req: AuthRequest, res) =>
  res.json(
    await rpc(req.db!, "list_split_templates", {
      p_group_id: req.params.groupId,
    }),
  ),
);
router.post(
  "/groups/:groupId",
  validateBody(template),
  async (req: AuthRequest, res) =>
    res.status(201).json(
      await rpc(req.db!, "manage_split_template", {
        p_group_id: req.params.groupId,
        p_input: req.body,
      }),
    ),
);
router.put(
  "/groups/:groupId/:id",
  validateBody(template),
  async (req: AuthRequest, res) =>
    res.json(
      await rpc(req.db!, "manage_split_template", {
        p_group_id: req.params.groupId,
        p_id: req.params.id,
        p_input: req.body,
      }),
    ),
);
router.delete("/groups/:groupId/:id", async (req: AuthRequest, res) => {
  await rpc(req.db!, "manage_split_template", {
    p_group_id: req.params.groupId,
    p_id: req.params.id,
    p_input: {},
    p_archive: true,
  });
  res.status(204).send();
});
export default router;
