import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { camelCase, dbResult } from "../db";
const router = Router();
router.use(authenticate);
router.get("/", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(await req.db!.from("reminders").select("*").order("due_date")),
    ),
  ),
);
router.post(
  "/",
  validateBody(
    z.object({
      title: z.string().trim().min(1),
      description: z.string().optional(),
      type: z.enum(["CUSTOM", "DEBT", "CREDIT_CARD_BILL", "EMI"]),
      dueDate: z.coerce.date(),
    }),
  ),
  async (req: AuthRequest, res) =>
    res
      .status(201)
      .json(
        camelCase(
          dbResult(
            await req
              .db!.from("reminders")
              .insert({
                title: req.body.title,
                description: req.body.description,
                type: req.body.type,
                due_date: req.body.dueDate.toISOString(),
                user_id: req.userId!,
              })
              .select()
              .single(),
          ),
        ),
      ),
);
for (const action of ["read", "complete"])
  router.patch(`/:id/${action}`, async (req: AuthRequest, res) =>
    res.json(
      camelCase(
        dbResult(
          await req
            .db!.from("reminders")
            .update(
              action === "read"
                ? { is_read: true }
                : { is_read: true, is_completed: true },
            )
            .eq("id", req.params.id as string)
            .select()
            .single(),
        ),
      ),
    ),
  );
router.delete("/:id", async (req: AuthRequest, res) => {
  dbResult(
    await req
      .db!.from("reminders")
      .delete()
      .eq("id", req.params.id as string)
      .select()
      .single(),
  );
  res.status(204).send();
});
export default router;
