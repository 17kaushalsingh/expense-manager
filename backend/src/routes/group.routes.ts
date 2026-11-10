import { HttpError } from "../errors/httpError";
import { z } from "zod";
import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createGroupSchema, addGroupMemberSchema } from "../validation/schemas";
import { camelCase, dbResult, rpc } from "../db";
import { csvDocument } from "../services/csv";
const router = Router();
router.use(authenticate);
export async function loadGroups(req: AuthRequest, id?: string) {
  let q = req
    .db!.from("groups")
    .select(
      "*,members:group_members(*),preferences:group_preferences(archived)",
    )
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
    const { preferences, ...sharedGroup } = group;
    result.push({
      ...sharedGroup,
      archived: Boolean(preferences[0]?.archived),
      my_balance: Number(graph.groupBalances?.[req.userId!] ?? 0),
    });
  }
  return camelCase(result);
}
router.get("/", async (req: AuthRequest, res) =>
  res.json(await loadGroups(req)),
);
router.put(
  "/:id/preferences",
  validateBody(z.object({ archived: z.boolean() }).strict()),
  async (req: AuthRequest, res) => {
    const row = dbResult(
      await req
        .db!.from("group_preferences")
        .upsert(
          {
            user_id: req.userId!,
            group_id: req.params.id as string,
            archived: req.body.archived,
          },
          { onConflict: "user_id,group_id" },
        )
        .select("archived")
        .single(),
    );
    res.json(row);
  },
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
router.get("/:id/summary", async (req: AuthRequest, res) => {
  const month = z
    .string()
    .regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/)
    .optional()
    .safeParse(req.query.month);
  if (!month.success) throw new HttpError(400, "Invalid month");
  res.json(
    await rpc(req.db!, "group_financial_summary", {
      p_group_id: req.params.id,
      p_month: month.data ?? null,
    }),
  );
});
router.get("/:id/export", async (req: AuthRequest, res) => {
  const month = z
    .string()
    .regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/)
    .optional()
    .safeParse(req.query.month);
  if (!month.success) throw new HttpError(400, "Invalid month");
  // Authorize explicitly, including empty groups. Never export private accounts/categories.
  const summary = await rpc<{ timezone: string }>(
    req.db!,
    "group_financial_summary",
    { p_group_id: req.params.id, p_month: month.data ?? null },
  );
  const profiles =
    dbResult(
      await req.db!.rpc("group_member_profiles", {
        p_group_id: req.params.id as string,
      }),
    ) ?? [];
  const names = new Map(profiles.map((p) => [p.id, p.name]));
  let query = req
    .db!.from("split_expenses")
    .select(
      "id,description,date,currency,total_amount,split_type,payers:split_payers(user_id,amount_paid),participants:split_participants(user_id,amount_owed)",
    )
    .eq("group_id", req.params.id as string)
    .order("date")
    .order("id");
  let payments = req
    .db!.from("settlements")
    .select("id,date,currency,amount,payer_id,payee_id,method")
    .eq("group_id", req.params.id as string)
    .order("date")
    .order("id");
  if (month.data) {
    const last = new Date(`${month.data}-01T12:00:00Z`);
    last.setUTCMonth(last.getUTCMonth() + 1);
    last.setUTCDate(0);
    const bounds = await rpc<{ from: string; to: string }>(
      req.db!,
      "local_date_bounds",
      {
        p_from: `${month.data}-01`,
        p_to: `${month.data}-${last.getUTCDate()}`,
      },
    );
    query = query.gte("date", bounds.from).lt("date", bounds.to);
    payments = payments.gte("date", bounds.from).lt("date", bounds.to);
  }
  const rows: unknown[][] = [];
  const localDate = (date: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: summary.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(date));
  for (let offset = 0; ; offset += 1000) {
    const page = dbResult(await query.range(offset, offset + 999)) ?? [];
    for (const e of page)
      rows.push([
        e.id,
        "EXPENSE",
        e.date,
        localDate(e.date),
        e.currency,
        e.description,
        Number(e.total_amount),
        e.split_type,
        e.payers
          .map(
            (p) =>
              `${names.get(p.user_id) ?? "Former member"}: ${p.amount_paid}`,
          )
          .join("; "),
        e.participants
          .map(
            (p) =>
              `${names.get(p.user_id) ?? "Former member"}: ${p.amount_owed}`,
          )
          .join("; "),
      ]);
    if (page.length < 1000) break;
  }
  for (let offset = 0; ; offset += 1000) {
    const page = dbResult(await payments.range(offset, offset + 999)) ?? [];
    for (const p of page)
      rows.push([
        p.id,
        "PAYMENT",
        p.date,
        localDate(p.date),
        p.currency,
        `${names.get(p.payer_id) ?? "Former member"} paid ${names.get(p.payee_id) ?? "Former member"}`,
        Number(p.amount),
        p.method,
        "",
        "",
      ]);
    if (page.length < 1000) break;
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="group-expenses.csv"',
  );
  res.send(
    csvDocument(
      [
        "ID",
        "Record",
        "Date (UTC)",
        `Local date (${summary.timezone})`,
        "Currency",
        "Description",
        "Total",
        "Method",
        "Paid by",
        "Shares",
      ],
      rows,
    ),
  );
});
router.get("/:id/default-split", async (req: AuthRequest, res) =>
  res.json(
    await rpc(req.db!, "group_split_default", { p_group_id: req.params.id }),
  ),
);
router.put(
  "/:id/default-split",
  validateBody(z.object({ templateId: z.uuid().nullable() })),
  async (req: AuthRequest, res) =>
    res.json(
      await rpc(req.db!, "set_group_split_default", {
        p_group_id: req.params.id,
        p_template_id: req.body.templateId,
      }),
    ),
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
