import { Request, Response, NextFunction } from "express";
import { DatabaseClient } from "../db";
import { getSupabaseClient } from "../db";
export interface AuthRequest extends Request {
  userId?: string;
  db?: DatabaseClient;
}
export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const client = getSupabaseClient(token);
    const { data, error } = await client.auth.getUser(token);
    if (
      error &&
      (!error.status || error.status >= 500 || error.status === 429)
    ) {
      res.setHeader("Retry-After", "30");
      res
        .status(503)
        .json({
          error:
            "Authentication service is temporarily unavailable. Please retry.",
        });
      return;
    }
    if (error || !data.user) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }
    req.userId = data.user.id;
    req.db = client;
    next();
  } catch (error) {
    next(error);
  }
}
