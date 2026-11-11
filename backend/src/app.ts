import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { config } from "./config";
import { HttpError } from "./errors/httpError";
import { jsonReplacer } from "./utils/money";

import planningRouter from "./routes/planning.routes";
import personalPlanningRouter from "./routes/personalPlanning.routes";
import collaborationRouter from "./routes/collaboration.routes";
import accountRouter from "./routes/account.routes";
import analyticsRouter from "./routes/analytics.routes";
import authRouter from "./routes/auth.routes";
import categoryRouter from "./routes/category.routes";
import groupRouter from "./routes/group.routes";
import settlementRouter from "./routes/settlement.routes";
import splitRouter from "./routes/split.routes";
import transactionRouter from "./routes/transaction.routes";
import userRouter from "./routes/user.routes";
import reminderRouter from "./routes/reminder.routes";

import templateRouter from "./routes/template.routes";
import recurringRouter from "./routes/recurring.routes";
import invitationRouter from "./routes/invitation.routes";
import receiptRouter from "./routes/receipt.routes";
import importRouter from "./routes/import.routes";

export const app = express();

app.disable("x-powered-by");
app.set("json replacer", jsonReplacer);
app.use((_req, res, next) => {
  // Auth sessions and financial responses must never enter browser/CDN caches.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use(cors({ origin: config.corsOrigin }));
app.use("/api/imports", express.json({ limit: "512kb" }));
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/accounts", accountRouter);
app.use("/api/planning", planningRouter);
app.use("/api/personal-planning", personalPlanningRouter);
app.use("/api/collaboration", collaborationRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/transactions", transactionRouter);
app.use("/api/groups", groupRouter);
app.use("/api/invitations", invitationRouter);
app.use("/api/receipts", receiptRouter);
app.use("/api/imports", importRouter);
app.use("/api/templates", templateRouter);
app.use("/api/recurring", recurringRouter);
app.use("/api/splits", splitRouter);
app.use("/api/settlements", settlementRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/reminders", reminderRouter);

app.get("/api/health", (req: Request, res: Response) => {
  res
    .status(200)
    .json({ status: "ok", message: "Expense Manager Backend is running" });
});

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  if ("type" in error && error.type === "entity.too.large") {
    res.status(413).json({ error: "Request body is too large" });
    return;
  }

  // Parser errors can contain the raw JSON body, including invitation/auth tokens.
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  console.error({
    name: error.name,
    method: req.method,
    path: req.path,
    message: "Unhandled API error",
  });
  res.status(500).json({ error: "Internal server error" });
});

// Vercel imports the composed app; index.ts retains local server startup.
export default app;
