import { describe, expect, it, vi } from "vitest";
import { degrees, PDFDocument, PDFName } from "pdf-lib";
import {
  addPageNumbers,
  addWatermark,
  assemble,
  extractPages,
  jpegOrientation,
  merge,
  optimizeLossless,
  readMetadata,
  visualBox,
  writeMetadata,
} from "./pdf";

// pdf.js is only needed for rendering, which these tests don't do.
vi.mock("./pdfjs", () => ({}));

/** A PDF whose pages have the given widths (height 500), so pages can be told apart by size. */
async function makePdf(widths: number[], rotation = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const w of widths) doc.addPage([w, 500]).setRotation(degrees(rotation));
  return doc.save();
}

async function pageInfo(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => ({ width: p.getWidth(), rotation: p.getRotation().angle }));
}

describe("assemble", () => {
  it("builds pages in the given order with rotation, blanks and duplicates", async () => {
    const sources: Record<string, Uint8Array> = {
      a: await makePdf([100, 200, 300]),
      b: await makePdf([400], 90),
    };
    const out = await assemble(
      [
        { sourceId: "b", pageIndex: 0, rotation: 90 },
        { sourceId: "a", pageIndex: 2, rotation: 0 },
        { sourceId: null, pageIndex: 0, rotation: 0, size: [50, 60] },
        { sourceId: "a", pageIndex: 0, rotation: -90 },
        { sourceId: "a", pageIndex: 2, rotation: 0 },
      ],
      (id) => sources[id],
    );
    expect(await pageInfo(out)).toEqual([
      { width: 400, rotation: 180 },
      { width: 300, rotation: 0 },
      { width: 50, rotation: 0 },
      { width: 100, rotation: 270 },
      { width: 300, rotation: 0 },
    ]);
  });

  it("names the file in the error when a source isn't a PDF", async () => {
    await expect(
      assemble([{ sourceId: "x", pageIndex: 0, rotation: 0 }], () => new Uint8Array([1, 2, 3]), () => "broken.pdf"),
    ).rejects.toThrow(/broken\.pdf could not be read/);
  });
});

describe("merge and extractPages", () => {
  it("merges whole files in order", async () => {
    const out = await merge([
      { name: "one.pdf", bytes: await makePdf([100, 200]) },
      { name: "two.pdf", bytes: await makePdf([300]) },
    ]);
    expect((await pageInfo(out)).map((p) => p.width)).toEqual([100, 200, 300]);
  });

  it("extracts the chosen pages in the chosen order", async () => {
    const src = await PDFDocument.load(await makePdf([100, 200, 300]));
    const out = await extractPages(src, [2, 0]);
    expect((await pageInfo(out)).map((p) => p.width)).toEqual([300, 100]);
  });
});

describe("optimizeLossless", () => {
  it("keeps document-level data such as bookmarks and metadata", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.setTitle("Report");
    doc.setSubject("Quarterly numbers");
    doc.setKeywords(["finance"]);
    doc.catalog.set(PDFName.of("Outlines"), doc.context.obj({ Type: "Outlines", Count: 0 }));
    const out = await PDFDocument.load(await optimizeLossless(await doc.save()));
    expect(out.catalog.get(PDFName.of("Outlines"))).toBeDefined();
    expect(out.getTitle()).toBe("Report");
    expect(out.getSubject()).toBe("Quarterly numbers");
    expect(out.getKeywords()).toBe("finance");
  });
});

describe("metadata", () => {
  it("writes and reads back document properties", async () => {
    const meta = { title: "T", author: "A", subject: "S", keywords: "x, y", creator: "C", producer: "P" };
    const out = await writeMetadata(await makePdf([100]), meta);
    expect(await readMetadata(out)).toEqual({ ...meta, keywords: "x y", pageCount: 1 });
  });

  it("can strip all metadata", async () => {
    const withMeta = await writeMetadata(await makePdf([100]), {
      title: "Secret",
      author: "Someone",
      subject: "",
      keywords: "",
      creator: "",
      producer: "",
    });
    const out = await readMetadata(await writeMetadata(withMeta, null));
    expect(out.title).toBe("");
    expect(out.author).toBe("");
  });
});

describe("watermark and page numbers", () => {
  it("adds content without changing the page count", async () => {
    const src = await makePdf([300, 300, 300]);
    const wm = await addWatermark(src, {
      text: "DRAFT",
      fontSize: 40,
      color: "#ff0000",
      opacity: 0.3,
      angle: 45,
      position: "tile",
      pages: [0, 2],
    });
    const numbered = await addPageNumbers(wm, {
      vertical: "bottom",
      horizontal: "center",
      format: "Page {n} of {total}",
      startAt: 1,
      fontSize: 11,
      margin: 20,
      color: "#000000",
      pages: null,
    });
    expect(await pageInfo(numbered)).toHaveLength(3);
    expect(numbered.length).toBeGreaterThan(src.length);
  });

  it("explains when the text can't be shown with the built-in fonts", async () => {
    const opts = { fontSize: 40, color: "#000000", opacity: 1, angle: 0, position: "center" as const, pages: null };
    await expect(addWatermark(await makePdf([300]), { ...opts, text: "سري" })).rejects.toThrow(/Latin characters/);
  });
});

describe("visualBox", () => {
  // The displayed page's bottom-left corner, for each /Rotate value, on a 200 x 100 page.
  it.each([
    [0, 200, 100, { x: 0, y: 0 }],
    [90, 100, 200, { x: 200, y: 0 }],
    [180, 200, 100, { x: 200, y: 100 }],
    [270, 100, 200, { x: 0, y: 100 }],
  ])("maps visual coordinates for rotation %i", async (rotation, width, height, bottomLeft) => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 100]);
    page.setRotation(degrees(rotation));
    const box = visualBox(page);
    expect([box.width, box.height]).toEqual([width, height]);
    expect(box.map(0, 0)).toEqual(bottomLeft);
    // The four visual corners land on the four corners of the page.
    const corners = [box.map(0, 0), box.map(width, 0), box.map(0, height), box.map(width, height)];
    expect(new Set(corners.map((c) => `${c.x},${c.y}`))).toEqual(new Set(["0,0", "200,0", "0,100", "200,100"]));
  });
});

describe("jpegOrientation", () => {
  /** A minimal JPEG header with an EXIF block holding one orientation tag. */
  function jpegWithOrientation(orientation: number, littleEndian: boolean): Uint8Array {
    const tiff = new DataView(new ArrayBuffer(26));
    tiff.setUint16(0, littleEndian ? 0x4949 : 0x4d4d);
    tiff.setUint16(2, 42, littleEndian);
    tiff.setUint32(4, 8, littleEndian); // first IFD right after the header
    tiff.setUint16(8, 1, littleEndian); // one entry
    tiff.setUint16(10, 0x0112, littleEndian); // orientation tag
    tiff.setUint16(12, 3, littleEndian); // SHORT
    tiff.setUint32(14, 1, littleEndian);
    tiff.setUint16(18, orientation, littleEndian);
    const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...new Uint8Array(tiff.buffer)];
    const len = exif.length + 2;
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...exif, 0xff, 0xda, 0, 2]);
  }

  it.each([true, false])("reads the tag (little-endian: %s)", (little) => {
    expect(jpegOrientation(jpegWithOrientation(6, little))).toBe(6);
    expect(jpegOrientation(jpegWithOrientation(3, little))).toBe(3);
  });

  it("returns 1 when there is no EXIF block", () => {
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0, 0]))).toBe(1);
  });

  it("returns 1 instead of throwing for a truncated EXIF block", () => {
    expect(jpegOrientation(jpegWithOrientation(6, false).slice(0, 20))).toBe(1);
  });
});
