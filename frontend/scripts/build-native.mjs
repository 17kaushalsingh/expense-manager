import {
  cp,
  mkdtemp,
  rm,
  readFile,
  writeFile,
  symlink,
  rename,
  access,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import nextEnv from "@next/env";
const root = resolve(import.meta.dirname, ".."),
  temp = await mkdtemp(join(root, ".native-build-")),
  output = join(root, ".next-native");
// Build an isolated copy: interruption can never remove the live dynamic web route.
try {
  nextEnv.loadEnvConfig(root, false);
  for (const name of [
    "src",
    "public",
    "next.config.ts",
    "tsconfig.json",
    "tsconfig.native.json",
    "package.json",
    "postcss.config.mjs",
  ]) {
    try {
      await access(join(root, name));
      await cp(join(root, name), join(temp, name), { recursive: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  await symlink(
    resolve(root, "../node_modules"),
    join(temp, "node_modules"),
    "dir",
  );
  await rm(join(temp, "src/app/groups/[id]"), { recursive: true, force: true });
  const api =
    process.env.NATIVE_API_URL ??
    "https://expense-manager-api-omega.vercel.app/api";
  if (new URL(api).protocol !== "https:")
    throw Error("Native cloud API must use HTTPS");
  const result = spawnSync(
    process.execPath,
    [join(root, "../node_modules/next/dist/bin/next"), "build", "--webpack"],
    {
      cwd: temp,
      stdio: "inherit",
      env: { ...process.env, NATIVE_EXPORT: "1", NEXT_PUBLIC_API_URL: api },
    },
  );
  if (result.status !== 0) throw Error("Native web export failed");
  const html = await readFile(
    join(temp, ".next-native/device/index.html"),
    "utf8",
  );
  if (!html.includes("/_next/static/"))
    throw Error("Device shell assets are missing");
  await writeFile(
    join(temp, ".next-native/native-build.json"),
    JSON.stringify({
      version: 1,
      bundled: true,
      startPath: "/device",
      builtAt: new Date().toISOString(),
    }),
  );
  let previous = false;
  try {
    await rename(output, join(temp, "previous"));
    previous = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await rename(join(temp, ".next-native"), output);
  } catch (error) {
    if (previous) await rename(join(temp, "previous"), output);
    throw error;
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
