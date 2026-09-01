import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import process from "node:process";

const sourcePath = process.env.EFFECTIVE_GENERATOR_FILE || "/work/build-effective-from-firebase.js";
const source = await readFile(sourcePath, "utf8");

const oldLine = '  if (/^(?:LAV\\.?|TERRA)$/.test(raw)) return "TERRA";';
const replacement = [
  '  if (/^LAV[.;]?$/.test(raw)) return "LAV";',
  '  if (raw === "TERRA") return "TERRA";',
].join("\n");

if (!source.includes(oldLine)) {
  if (source.includes('return "LAV"') && source.includes('raw === "TERRA"')) {
    console.error("Il generatore locale sembra già distinguere LAV da TERRA: eseguilo direttamente.");
    process.exit(2);
  }
  throw new Error("Non trovo la vecchia normalizzazione LAV/TERRA nel generatore. Nessuna modifica eseguita.");
}

const patched = source.replace(oldLine, replacement);
const tempPath = `/tmp/build-effective-preserve-lav-${process.pid}.mjs`;
await writeFile(tempPath, patched, "utf8");

console.error("NaviSuite V2: normalizzazione corretta attiva (LAV resta LAV, TERRA resta TERRA).\n");
await import(pathToFileURL(tempPath).href);
