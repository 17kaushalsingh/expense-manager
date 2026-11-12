import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { dbResult, camelCase, rpc } from "../db";
import { HttpError } from "../errors/httpError";
const router = Router();
router.use(authenticate);
const target = z
  .object({ transactionId: z.uuid().optional(), splitId: z.uuid().optional() })
  .refine(
    (v) => Number(!!v.transactionId) + Number(!!v.splitId) === 1,
    "Choose one receipt target",
  );
router.get("/", async (req: AuthRequest, res) => {
  const parsed = target.safeParse(req.query);
  if (!parsed.success)
    throw new HttpError(400, "Choose a transaction or split");
  const t = parsed.data;
  let query = req
    .db!.from("receipt_attachments")
    .select("*")
    .order("created_at");
  query = t.transactionId
    ? query.eq("transaction_id", t.transactionId)
    : query.eq("split_id", t.splitId!);
  res.json(camelCase(dbResult(await query)));
});
router.post(
  "/",
  validateBody(
    z
      .object({
        requestKey: z.uuid().optional(),
        transactionId: z.uuid().optional(),
        splitId: z.uuid().optional(),
        fileName: z
          .string()
          .trim()
          .min(1)
          .max(160)
          .regex(/^[^\x00-\x1f\x7f/\\]+$/),
        mimeType: z.enum([
          "image/jpeg",
          "image/png",
          "image/webp",
          "application/pdf",
        ]),
        byteSize: z
          .number()
          .int()
          .min(1)
          .max(5 * 1024 * 1024),
      })
      .refine((v) => Number(!!v.transactionId) + Number(!!v.splitId) === 1),
  ),
  async (req: AuthRequest, res) => {
    res.status(201).json(
      await rpc(req.db!, "manage_receipt", {
        p_action: "CREATE",
        p_input: req.body,
      }),
    );
  },
);
router.post("/:id/complete", async (req: AuthRequest, res) => {
  res.json(
    await rpc(req.db!, "manage_receipt", {
      p_action: "COMPLETE",
      p_id: req.params.id,
    }),
  );
});
router.post("/:id/download", async (req: AuthRequest, res) => {
  const receipt = dbResult(
    await req
      .db!.from("receipt_attachments")
      .select("*")
      .eq("id", String(req.params.id))
      .eq("status", "READY")
      .single(),
  );
  if (!receipt) throw new HttpError(404, "Receipt not found");
  const { data, error } = await req
    .db!.storage.from("receipts")
    .createSignedUrl(receipt.object_path, 60, { download: receipt.file_name });
  if (error) throw new HttpError(400, "Unable to prepare receipt download");
  res.json({ url: data.signedUrl, expiresIn: 60 });
});
router.delete("/:id", async (req: AuthRequest, res) => {
  const receipt = dbResult(
    await req
      .db!.from("receipt_attachments")
      .select("*")
      .eq("id", String(req.params.id))
      .single(),
  );
  if (!receipt) throw new HttpError(404, "Receipt not found");
  // Storage RLS rechecks current write permission; metadata deletion also checks
  // that the file is gone. Retry safely if either service is unavailable.
  const { error } = await req
    .db!.storage.from("receipts")
    .remove([receipt.object_path]);
  if (error) throw new HttpError(403, "Unable to remove this receipt");
  await rpc(req.db!, "manage_receipt", {
    p_action: "DELETE",
    p_id: req.params.id,
  });
  res.status(204).send();
});
export default router;
