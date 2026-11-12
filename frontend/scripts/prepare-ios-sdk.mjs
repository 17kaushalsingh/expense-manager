import { mkdir, mkdtemp, readFile, rm, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";

// Pin both release and digests to the upstream 8.6.0 Package.swift.
const version = "8.6.0";
const checksums = {
  Capacitor: "df2b77a471b939ce2d1b954cf11247714154bb5f91fa94901d3547e8fda314ad",
  Cordova: "150543647078664bd1e852574cec4a65d0a38c9d3c5a8a07740b17b07850d3f6",
};
const root = resolve(import.meta.dirname, "../ios/App/CapacitorSDK");
await mkdir(root, { recursive: true });
const temporary = await mkdtemp(join(root, ".prepare-"));
try {
  for (const [name, checksum] of Object.entries(checksums)) {
    const zip = join(temporary, `${name}.zip`);
    const download = spawnSync("curl", ["--fail", "--location", "--retry", "2", "--connect-timeout", "15", "--max-time", "180", "--proto", "=https", "--proto-redir", "=https", "--output", zip,
      `https://github.com/ionic-team/capacitor-swift-pm/releases/download/${version}/${name}.xcframework.zip`], { stdio: "inherit" });
    if (download.status !== 0) throw Error(`${name} SDK download failed`);
    const digest = createHash("sha256").update(await readFile(zip)).digest("hex");
    if (digest !== checksum) throw Error(`${name} SDK checksum mismatch`);
    const listing = spawnSync("unzip", ["-Z1", zip], { encoding: "utf8" });
    if (listing.status !== 0 || listing.stdout.trim().split("\n").some((p) => !p.startsWith(`${name}.xcframework/`) || p.split("/").includes("..") || p.includes("\\")))
      throw Error("Unexpected SDK archive paths");
    const extracted = spawnSync("unzip", ["-q", zip, "-d", temporary], { stdio: "inherit" });
    if (extracted.status !== 0) throw Error(`${name} SDK extraction failed`);
  }
  await writeFile(join(temporary, "verified.json"), JSON.stringify({ version, checksums }, null, 2));
  const destination = join(root, "Frameworks");
  await rm(destination, { recursive: true, force: true });
  const frameworks = join(temporary, "Frameworks");
  await mkdir(frameworks);
  for (const name of Object.keys(checksums))
    await rename(join(temporary, `${name}.xcframework`), join(frameworks, `${name}.xcframework`));
  await rename(join(temporary, "verified.json"), join(frameworks, "verified.json"));
  await rename(frameworks, destination);
  console.log(`Prepared official Capacitor ${version} iOS SDKs (SHA-256 verified)`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
