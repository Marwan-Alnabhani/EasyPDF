import { zipSync } from "fflate";

export const PDF_ACCEPT = "application/pdf,.pdf";
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/bmp";

export async function readBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function uid(): string {
  return crypto.randomUUID();
}

/** True when running inside the easyPDF desktop app (Tauri). */
export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Saves data to the user's computer: a native "Save as" dialog in the desktop
 * app, a regular browser download otherwise. Nothing is uploaded anywhere.
 * Resolves to false if the user cancelled.
 */
export async function download(data: Uint8Array | Blob, filename: string, type = "application/pdf"): Promise<boolean> {
  if (isDesktop) {
    const { invoke } = await import("@tauri-apps/api/core");
    const bytes = data instanceof Blob ? await readBytes(data) : data;
    return invoke<boolean>("save_file", bytes, { headers: { "x-file-name": encodeURIComponent(filename) } });
  }
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Saves a single file directly, or several files bundled as a .zip. */
export function downloadMany(files: { name: string; data: Uint8Array }[], zipName: string): Promise<boolean> {
  if (files.length === 1) {
    const f = files[0];
    return download(f.data, f.name, f.name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
  }
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[uniqueName(entries, f.name)] = f.data;
  return download(zipSync(entries, { level: 0 }), zipName, "application/zip");
}

function uniqueName(existing: Record<string, unknown>, name: string): string {
  if (!(name in existing)) return name;
  const ext = name.match(/\.[^.]+$/)?.[0] ?? "";
  const stem = name.slice(0, name.length - ext.length);
  let i = 2;
  while (`${stem} (${i})${ext}` in existing) i++;
  return `${stem} (${i})${ext}`;
}

/**
 * Parses a page selection like "1-3, 5, 8-" into 0-based page indices.
 * Throws a readable error for invalid input.
 */
export function parsePageList(input: string, total: number): number[] {
  return parseRangeGroups(input, total).flat();
}

/** Like parsePageList, but keeps each comma-separated group separate: "1-3, 4-6" -> [[0,1,2],[3,4,5]]. */
export function parseRangeGroups(input: string, total: number): number[][] {
  const parts = input.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("Enter at least one page or range, e.g. 1-3, 5");
  return parts.map((part) => {
    const m = part.match(/^(\d*)\s*(?:-\s*(\d*))?$/);
    if (!m || (m[1] === "" && m[2] === undefined)) throw new Error(`"${part}" is not a valid page or range`);
    const isRange = part.includes("-");
    const start = m[1] ? parseInt(m[1], 10) : 1;
    const end = isRange ? (m[2] ? parseInt(m[2], 10) : total) : start;
    if (start < 1 || end < 1 || start > total || end > total)
      throw new Error(`"${part}" is outside the document (1-${total})`);
    const out: number[] = [];
    const step = start <= end ? 1 : -1;
    for (let p = start; step > 0 ? p <= end : p >= end; p += step) out.push(p - 1);
    return out;
  });
}

export function hexToRgb01(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
