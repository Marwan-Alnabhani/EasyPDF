// Collects the licenses of everything easyPDF ships that it didn't write:
// JavaScript packages bundled into the app, pdf.js's fonts/decoders copied to
// public/pdfjs, and (when cargo is available) the Rust crates compiled into the
// desktop app. Writes public/THIRD_PARTY_LICENSES.txt, which the build copies
// into dist/ and the Windows installer installs next to the app.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "public", "THIRD_PARTY_LICENSES.txt");
const lockFiles = [join(root, "package-lock.json"), join(root, "src-tauri", "Cargo.lock")];

// Skip the work when nothing changed since the last run (keeps `npm run dev` fast).
if (!process.argv.includes("--force") && existsSync(output)) {
  const built = statSync(output).mtimeMs;
  if (lockFiles.every((f) => !existsSync(f) || statSync(f).mtimeMs < built)) {
    console.log("Third-party licenses are up to date");
    process.exit(0);
  }
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice)/i;

/** Reads every license-like file in a directory. */
function licenseTexts(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => LICENSE_FILE.test(f) && statSync(join(dir, f)).isFile())
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n").trim());
}

/** Groups packages by identical license text, so each text is printed once. */
class Section {
  constructor(title) {
    this.title = title;
    this.groups = new Map();
  }
  add(label, license, texts, source) {
    const text = texts.length
      ? texts.join("\n\n")
      : `(The package includes no license file.)\nDeclared license: ${license || "unknown"}\nSource code: ${source || "unknown"}`;
    // Texts that differ only in whitespace or line wrapping are printed once.
    const key = text.replace(/\s+/g, " ");
    if (!this.groups.has(key)) this.groups.set(key, { text, labels: [] });
    this.groups.get(key).labels.push(label);
  }
  render() {
    const bar = "=".repeat(78);
    const parts = [`${bar}\n${this.title}\n${bar}`];
    for (const { text, labels } of this.groups.values()) {
      parts.push(`${"-".repeat(78)}\nUsed by: ${labels.sort().join(", ")}\n\n${text}`);
    }
    return parts.join("\n\n");
  }
}

// ---- JavaScript packages that ship in the app (not build tools) ----
const js = new Section("JavaScript packages");
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
for (const [path, info] of Object.entries(lock.packages)) {
  // Optional packages here are Node-only add-ons (e.g. @napi-rs/canvas for
  // pdf.js) that never end up in the browser bundle.
  if (!path || info.dev || info.devOptional || info.optional) continue;
  const name = path.replace(/^.*node_modules\//, "");
  js.add(`${name} ${info.version}`, info.license, licenseTexts(join(root, path)), `https://www.npmjs.com/package/${name}`);
}

// ---- pdf.js runtime assets (fonts, character maps, image decoders) ----
const assets = new Section("pdf.js fonts, character maps and decoders");
const pdfjs = join(root, "node_modules", "pdfjs-dist");
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  for (const f of readdirSync(join(pdfjs, dir)).filter((f) => LICENSE_FILE.test(f)).sort()) {
    assets.add(`pdfjs-dist/${dir}/${f}`, "", [readFileSync(join(pdfjs, dir, f), "utf8").replace(/\r\n/g, "\n").trim()]);
  }
}

// ---- Rust crates compiled into the Windows desktop app ----
const rust = new Section("Rust crates (desktop app)");
let rustNote = "";
try {
  const meta = JSON.parse(
    execFileSync(
      "cargo",
      ["metadata", "--format-version", "1", "--filter-platform", "x86_64-pc-windows-msvc", "--locked"],
      { cwd: join(root, "src-tauri"), maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] },
    ).toString(),
  );
  const packages = new Map(meta.packages.map((p) => [p.id, p]));
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  // Walk normal (non-build, non-dev) dependencies from the app crate.
  const seen = new Set();
  const stack = [meta.resolve.root];
  while (stack.length) {
    for (const dep of nodes.get(stack.pop()).deps) {
      if (seen.has(dep.pkg) || !dep.dep_kinds.some((k) => k.kind === null)) continue;
      seen.add(dep.pkg);
      stack.push(dep.pkg);
    }
  }
  for (const id of seen) {
    const p = packages.get(id);
    rust.add(
      `${p.name} ${p.version}`,
      p.license,
      licenseTexts(dirname(p.manifest_path)),
      p.repository ?? `https://crates.io/crates/${p.name}/${p.version}`,
    );
  }
} catch (e) {
  rustNote = `\n(Rust crates not listed: cargo was unavailable when this file was generated.)\n`;
  console.warn(`Skipping Rust crate licenses: ${e.message}`);
}

const header = `easyPDF includes the following third-party software.
easyPDF itself is licensed under the MIT License (see LICENSE).
${rustNote}`;
const sections = [js, assets, rust].filter((s) => s.groups.size).map((s) => s.render());
writeFileSync(output, `${header}\n${sections.join("\n\n\n")}\n`);
console.log(`Wrote ${output} (${js.groups.size + assets.groups.size + rust.groups.size} distinct license texts)`);
