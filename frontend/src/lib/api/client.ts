import { workspace } from "@/lib/device/vault";
import { supabase } from "@/lib/supabase";
const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request<T>(
  method: string,
  endpoint: string,
  body?: unknown,
  token?: string,
  responseType: "json" | "blob" = "json",
): Promise<T> {
  let access = token;
  if (
    !endpoint.startsWith("/auth/") &&
    (!access || workspace()?.mode === "CLOUD")
  ) {
    const { data, error } = await supabase().auth.getSession();
    if (error) throw error;
    const device = workspace();
    if (
      device?.mode === "CLOUD" &&
      data.session &&
      data.session.user.id !== device.ownerId
    )
      throw new ApiError(
        "This login belongs to another device workspace. Switch accounts before syncing.",
        403,
      );
    access = data.session?.access_token ?? token;
  }
  const run = () =>
    fetch(`${base}${endpoint}`, {
      method,
      signal: AbortSignal.timeout(
        endpoint === "/portability/export" ? 120000 : 15000,
      ),
      headers: {
        "Content-Type": "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  let res = await run();
  if (res.status === 401 && access) {
    const { data, error } = await supabase().auth.refreshSession();
    if (!error && data.session) {
      const device = workspace();
      if (device?.mode === "CLOUD" && data.session.user.id !== device.ownerId)
        throw new ApiError(
          "Device workspace and refreshed session differ",
          403,
        );
      access = data.session.access_token;
      res = await run();
    }
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    const issues = Array.isArray(error.issues)
      ? error.issues
          .map(
            (issue: { path?: string; message?: string }) =>
              `${issue.path ? `${issue.path}: ` : ""}${issue.message || "Invalid value"}`,
          )
          .join("; ")
      : "";
    throw new ApiError(
      `${error.error || "Request failed"}${issues ? `: ${issues}` : ""}`,
      res.status,
    );
  }
  return res.status === 204
    ? (null as T)
    : responseType === "blob"
      ? (res.blob() as Promise<T>)
      : res.json();
}
export const apiClient = {
  download: (endpoint: string) =>
    request<Blob>("GET", endpoint, undefined, undefined, "blob"),
  get: <T = unknown>(endpoint: string, token?: string) =>
    request<T>("GET", endpoint, undefined, token),
  post: <T = unknown>(endpoint: string, body: unknown, token?: string) =>
    request<T>("POST", endpoint, body, token),
  put: <T = unknown>(endpoint: string, body: unknown, token?: string) =>
    request<T>("PUT", endpoint, body, token),
  patch: <T = unknown>(endpoint: string, body: unknown, token?: string) =>
    request<T>("PATCH", endpoint, body, token),
  delete: <T = unknown>(endpoint: string, token?: string) =>
    request<T>("DELETE", endpoint, undefined, token),
};
