import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import process from "node:process";

const sourcePath = process.env.EFFECTIVE_GENERATOR_FILE || "/work/build-effective-from-firebase.js";
const source = await readFile(sourcePath, "utf8");

const oldLine = '  if (/^(?:LAV\\.?|TERRA)$/.test(raw)) return "TERRA";';
const replacement = '  if (/^(?:LAV[.;]?|TERRA)$/.test(raw)) return "LAV";';

if (!source.includes(oldLine)) {
  if (source.includes('return "LAV"') && source.includes('TERRA')) {
    console.error("Il generatore locale sembra già normalizzare LAV/TERRA a LAV: eseguilo direttamente.");
    process.exit(2);
  }
  throw new Error("Non trovo la vecchia normalizzazione LAV/TERRA nel generatore. Nessuna modifica eseguita.");
}

const patched = source.replace(oldLine, replacement);
const tempPath = `/tmp/build-effective-normalize-lav-${process.pid}.mjs`;
await writeFile(tempPath, patched, "utf8");

console.error("NaviSuite V2: normalizzazione attiva (terra/lav/LAV./LAV; -> LAV).\n");
await import(pathToFileURL(tempPath).href);
