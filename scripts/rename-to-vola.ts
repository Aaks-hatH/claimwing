/**
 * One-time rename: Vola -> Vola, everywhere.
 *
 * Run from the project root:   npx tsx scripts/rename-to-vola.ts
 * Preview without writing:     npx tsx scripts/rename-to-vola.ts --dry
 *
 * Keeps the original casing: Vola -> Vola, vola -> vola, VOLA -> VOLA.
 * Safe to run twice (the second run finds nothing). Delete this file afterwards.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DRY = process.argv.includes("--dry");
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo", ".vercel"]);
const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".mov", ".onnx", ".pkl", ".bin"]);
const SELF = path.resolve(process.argv[1] ?? "");

function rename(text: string) {
  return text.replace(/claim[ _-]?wing/gi, (m) => {
    if (m === m.toUpperCase()) return "VOLA";
    if (m === m.toLowerCase()) return "vola";
    return "Vola";
  });
}

async function walk(dir: string, out: string[] = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name) || e.isSymbolicLink()) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, out);
    } else if (e.isFile() && !SKIP_EXT.has(path.extname(e.name).toLowerCase()) && path.resolve(full) !== SELF) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const changed: string[] = [];
  for (const file of await walk(ROOT)) {
    const buf = await fs.readFile(file);
    if (buf.includes(0)) continue; // binary
    const before = buf.toString("utf8");
    const after = rename(before);
    if (after === before) continue;
    if (!DRY) await fs.writeFile(file, after);
    changed.push(path.relative(ROOT, file));
  }

  // Rename any file or folder whose own name contains the old name (deepest first).
  const renamed: string[] = [];
  async function renamePaths(dir: string) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name) || e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await renamePaths(full);
      const next = rename(e.name);
      if (next !== e.name && path.resolve(full) !== SELF) {
        if (!DRY) await fs.rename(full, path.join(dir, next));
        renamed.push(`${path.relative(ROOT, full)} -> ${next}`);
      }
    }
  }
  await renamePaths(ROOT);

  console.log(`${DRY ? "[dry run] would update" : "Updated"} ${changed.length} files:`);
  for (const f of changed) console.log("  " + f);
  if (renamed.length) {
    console.log(`${DRY ? "Would rename" : "Renamed"}:`);
    for (const r of renamed) console.log("  " + r);
  }
  if (!changed.length && !renamed.length) console.log("Nothing left to rename.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
