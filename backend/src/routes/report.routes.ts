import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { HttpError } from "../errors/httpError";
import { financialReport } from "../services/reports";
import { reportExcel, reportPdf } from "../services/reportFiles";
const router = Router();
router.use(authenticate);
router.get("/", async (req: AuthRequest, res) => {
  const f = z
    .object({
      fromDate: z.iso.date(),
      toDate: z.iso.date(),
      accountId: z.uuid().optional(),
      format: z.enum(["json", "pdf", "xlsx"]).default("json"),
    })
    .safeParse(req.query);
  if (!f.success || f.data.fromDate > f.data.toDate)
    throw new HttpError(400, "Choose a valid date range");
  if (Date.parse(f.data.toDate) - Date.parse(f.data.fromDate) > 3660 * 86400000)
    throw new HttpError(400, "Choose a period of at most ten years");
  const report = await financialReport(
    req.db!,
    req.userId!,
    f.data.fromDate,
    f.data.toDate,
    f.data.accountId,
  );
  if (f.data.format === "json") {
    res.json(report);
    return;
  }
  const buffer =
    f.data.format === "pdf"
      ? await reportPdf(report)
      : await reportExcel(report);
  if (buffer.length > 4 * 1024 * 1024)
    throw new HttpError(
      400,
      "Export is too large. Choose a shorter period or one account.",
    );
  res.setHeader(
    "Content-Type",
    f.data.format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="ledgersync-${f.data.fromDate}-${f.data.toDate}.${f.data.format}"`,
  );
  res.send(buffer);
});
export default router;
