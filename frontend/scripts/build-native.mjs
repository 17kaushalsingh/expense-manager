import { rename, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
// Native serves bundled HTML and uses /group?groupId=... for arbitrary group IDs.
// Keep the existing dynamic web route untouched outside this isolated build.
const root = resolve(import.meta.dirname, ".."),
  temp = await mkdtemp(join(tmpdir(), "ledgersync-native-")),
  route = join(root, "src/app/groups/[id]");
let moved = false;
try {
  await rename(route, join(temp, "group-route"));
  moved = true;
  const result = spawnSync(
    process.execPath,
    [join(root, "../node_modules/next/dist/bin/next"), "build", "--webpack"],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        NATIVE_EXPORT: "1",
        NEXT_PUBLIC_API_URL:
          process.env.NATIVE_API_URL ??
          "https://expense-manager-api-omega.vercel.app/api",
      },
    },
  );
  if (result.status !== 0) throw Error("Native web export failed");
  const html = await readFile(
    join(root, ".next-native/device/index.html"),
    "utf8",
  );
  if (!html.includes("/_next/static/"))
    throw Error("Native device shell is missing its assets");
  await writeFile(
    join(root, ".next-native/native-build.json"),
    JSON.stringify({
      version: 1,
      bundled: true,
      startPath: "/device",
      builtAt: new Date().toISOString(),
    }),
  );
} finally {
  if (moved) await rename(join(temp, "group-route"), route);
  await rm(temp, { recursive: true, force: true });
}
