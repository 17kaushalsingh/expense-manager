import { Router } from "express";
import { z } from "zod";
import { createHash } from "node:crypto";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { dbResult, rpc } from "../db";
import { HttpError } from "../errors/httpError";
const router = Router();
router.use(authenticate);
router.get("/export", async (req: AuthRequest, res) => {
  const snapshot = dbResult(
    await req.db!.rpc("export_device_snapshot"),
  ) as unknown as {
    ownerId: string;
    tables: Record<string, Record<string, unknown>[]>;
  };
  for (const table of ["card_settings", "finance_preferences"]) {
    for (const row of snapshot.tables[table] ?? [])
      row.id = row[table === "card_settings" ? "account_id" : "user_id"];
  }
  const identities: Record<string, unknown>[] = [];
  for (const g of snapshot.tables.groups ?? []) {
    const people =
      dbResult(
        await req.db!.rpc("group_member_profiles", {
          p_group_id: String(g.id),
        }),
      ) ?? [];
    for (const person of people)
      identities.push({
        id: `${g.id}:${person.id}`,
        group_id: g.id,
        user_id: person.id,
        name: person.name,
      });
  }
  snapshot.tables.member_identities = identities;
  const attachments = [];
  let bytes = Buffer.byteLength(JSON.stringify(snapshot));
  for (const r of snapshot.tables.receipt_attachments ?? []) {
    if (r.status !== "READY") continue;
    const file = await req
      .db!.storage.from("receipts")
      .download(String(r.object_path));
    if (file.error)
      throw new HttpError(
        409,
        "A receipt changed or could not be downloaded. Refresh and retry; no partial backup was produced.",
      );
    const data = Buffer.from(await file.data.arrayBuffer());
    bytes += Math.ceil((data.length * 4) / 3);
    if (bytes > 100 * 1024 * 1024)
      throw new HttpError(
        413,
        "Backup exceeds 100 MiB. No partial backup was produced.",
      );
    if (data.length !== r.byte_size)
      throw new HttpError(409, "Receipt integrity mismatch");
    attachments.push({
      id: r.id,
      name: r.file_name,
      mime: r.mime_type,
      bytes: data.toString("base64"),
      sha256: createHash("sha256").update(data).digest("base64"),
    });
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.flushHeaders();
  // Chunk encoded bytes, preserving astral Unicode characters at chunk boundaries.
  const output = Buffer.from(JSON.stringify({ ...snapshot, attachments }), "utf8");
  for (let offset = 0; offset < output.length; offset += 32768) {
    if (!res.write(output.subarray(offset, offset + 32768)))
      await new Promise<void>((resolve) => res.once("drain", resolve));
  }
  res.end();
});
router.get("/entry-reference", async (req: AuthRequest, res) => {
  const p = z
    .object({
      sourceType: z.enum([
        "CONVERSION",
        "PERSONAL_ENTRY",
        "PERSONAL_LOAN",
        "PERSONAL_BILL",
      ]),
      sourceId: z.uuid(),
      accountId: z.uuid(),
      type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
      amount: z.coerce.number().finite().positive(),
    })
    .safeParse(req.query);
  if (!p.success) throw new HttpError(400, "Invalid source reference");
  const f = p.data;
  const rows = dbResult(
    await req
      .db!.from("transactions")
      .select("id")
      .eq("source_type", f.sourceType)
      .eq("source_id", f.sourceId)
      .eq("account_id", f.accountId)
      .eq("type", f.type)
      .eq("amount", f.amount)
      .limit(2),
  );
  if (!rows || rows.length !== 1)
    throw new HttpError(
      409,
      "Source entry is not uniquely available. Refresh the device snapshot.",
    );
  res.json(rows[0]);
});
router.post(
  "/commands",
  validateBody(
    z
      .object({
        id: z.uuid(),
        ownerId: z.uuid(),
        kind: z.enum([
          "TX_CREATE",
          "TX_UPDATE",
          "TX_DELETE",
          "ACCOUNT_CREATE",
          "ACCOUNT_UPDATE",
          "ACCOUNT_DELETE",
          "TRANSFER",
          "CONVERSION_CREATE",
          "CONVERSION_UPDATE",
          "CONVERSION_DELETE",
          "PERSONAL_ENTRY_CREATE",
          "PERSONAL_ENTRY_UPDATE",
          "PERSONAL_ENTRY_DELETE",
          "SPLIT_CREATE",
          "SPLIT_UPDATE",
          "SPLIT_DELETE",
          "SETTLEMENT",
          "CATEGORY_CREATE",
          "CATEGORY_UPDATE",
          "CATEGORY_DELETE",
          "RESOURCE_SAVE",
          "RESOURCE_DELETE",
          "LOAN_CREATE",
          "LOAN_ARCHIVE",
          "LOAN_PAY",
          "LOAN_REVERSE",
          "BILL_CREATE",
          "BILL_UPDATE",
          "BILL_REFRESH",
          "BILL_RECORD",
          "BILL_SKIP",
          "BILL_REVERSE",
          "BILL_POSTPONE",
        ]),
        payload: z.record(z.string(), z.unknown()),
        expectedUpdatedAt: z.iso.datetime({ offset: true }).optional(),
      })
      .strict(),
  ),
  async (req: AuthRequest, res) => {
    if (req.body.ownerId !== req.userId)
      throw new HttpError(403, "Device workspace and signed-in account differ");
    res.json(
      await rpc(req.db!, "execute_device_command", {
        p_id: req.body.id,
        p_kind: req.body.kind,
        p_payload: req.body.payload,
        p_expected_updated_at: req.body.expectedUpdatedAt ?? null,
      }),
    );
  },
);
export default router;
