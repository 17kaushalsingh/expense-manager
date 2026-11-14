import { Request, Response, NextFunction } from "express";
import { DatabaseClient } from "../db";
import { getSupabaseClient } from "../db";
export interface AuthRequest extends Request {
  userId?: string;
  db?: DatabaseClient;
  sessionId?: string;
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
    // Supabase Data API verifies JWT signature/expiry before executing this RPC.
    // Identity comes from auth.uid(), never from a locally decoded/unverified token.
    const session = await client.rpc("verify_current_session");
    if (session.error || !session.data) {
      if (
        ["PT401", "PGRST301", "PGRST302", "PGRST303", "42501"].includes(
          session.error?.code ?? "",
        )
      ) {
        res.status(401).json({ error: "Session revoked or expired" });
      } else {
        res.setHeader("Retry-After", "30");
        res
          .status(503)
          .json({
            error:
              "Session verification is temporarily unavailable. Please retry.",
          });
      }
      return;
    }
    const identity = session.data as { session_id?: string; user_id?: string };
    if (!identity.user_id || !identity.session_id) {
      res
        .status(503)
        .json({ error: "Session verification returned an invalid identity" });
      return;
    }
    req.userId = identity.user_id;
    req.sessionId = identity.session_id;
    req.db = client;
    next();
  } catch (error) {
    next(error);
  }
}
