import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const releaseDir = join(root, "release");
await mkdir(releaseDir, { recursive: true });

const expected = join(releaseDir, `${pkg.name}-${pkg.version}.tgz`);
await rm(expected, { force: true });

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  npmCommand,
  ["pack", "--pack-destination", releaseDir],
  { cwd: root, stdio: "inherit" }
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`SDK package archive written to release/${pkg.name}-${pkg.version}.tgz`);
