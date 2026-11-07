import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, ".env");
if (!existsSync(envFile) && !process.env.SMARTSPECTRA_API_KEY) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("Your key stays on this computer. Do not share it or commit .env.");
    const key = (await prompt.question("Paste your new SmartSpectra API key and press Enter: ")).trim();
    if (!key || /[\r\n]/.test(key)) throw new Error("An API key is required.");
    writeFileSync(envFile, `SMARTSPECTRA_API_KEY=${key}\n`, { mode: 0o600 });
  } catch {
    console.error("Setup cancelled. Run the launcher again with a valid key.");
    process.exitCode = 1;
  } finally {
    prompt.close();
  }
}
if (!process.exitCode) {
  try { await import("./server.mjs"); }
  catch (error) {
    console.error("The companion could not start. Check Node.js 20+, supported OS, and installed dependencies.");
    console.error(error instanceof Error ? error.message : "Unknown startup error");
    process.exitCode = 1;
  }
}