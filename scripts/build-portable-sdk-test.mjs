import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const sourceHtml = join(root, "examples", "portable-sdk-test", "index.html");
const outDir = join(root, "release", `openeyetrack-portable-test-${pkg.version}`);
const sdkDir = join(outDir, "openeyetrack");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await cp(join(root, "dist-sdk"), sdkDir, { recursive: true });
await cp(sourceHtml, join(outDir, "index.html"));
await writeFile(
  join(outDir, "README.txt"),
  [
    `OpenEyeTrack portable SDK acceptance test ${pkg.version}`,
    "",
    "Serve this directory over http://localhost (do not open index.html as file://).",
    "From the OpenEyeTrack repository run:",
    "  npm run serve:sdk-portable-test",
    "",
    "The page imports only ./openeyetrack/openeyetrack.es.js and the packaged assets beside it."
  ].join("\n") + "\n",
  "utf8"
);

console.log(`Portable SDK acceptance kit built at release/openeyetrack-portable-test-${pkg.version}/`);
