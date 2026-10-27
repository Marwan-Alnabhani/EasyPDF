# easyPDF

A free, private PDF toolkit that runs entirely on your device, in the browser or as a Windows
desktop app. Files are never uploaded: all processing happens locally, and the app works offline.

## Tools

| Tool | What it does |
| --- | --- |
| **Organize & Merge** | Load PDFs and images, then drag pages to reorder, rotate, duplicate, delete, insert blank pages, reverse. Multi-select (Ctrl/Shift-click) and move pages as a group. Undo/redo. Export everything or only the selection. |
| **Merge PDFs** | Combine whole files in a chosen order (fast, no thumbnails). |
| **Split / Extract** | Split by ranges (`1-3, 4-`), every N pages, every page, or extract chosen pages into a new file. |
| **Compress** | Lossless re-pack, or strong "scan-style" compression that turns pages into JPEGs. |
| **Create PDF (Images)** | Build a PDF from JPG/PNG/WebP/GIF/BMP. You can add PDFs to the same list and they are merged in place. Phone photos are auto-rotated. |
| **PDF to Images** | Export pages as PNG/JPG at 72/150/300 DPI (zip for multiple pages). |
| **Watermark** | Centered or tiled text with size, angle, color and opacity, plus a live preview. |
| **Page Numbers** | 6 positions, several formats (`Page 1 of 10`…), start number, page range, live preview. |
| **Metadata** | Edit title/author/etc. or strip all metadata before sharing. |

Organizer shortcuts: `Del` delete · `R` / `Shift+R` rotate · `Ctrl+D` duplicate · `Ctrl+Z` / `Ctrl+Y` undo/redo · `Ctrl+A` select all · double-click to preview.

## Run it

Requires [Node.js](https://nodejs.org) 22+.

```bash
git clone https://github.com/Marwan-Alnabhani/EasyPDF.git
cd EasyPDF
npm install
npm run dev          # development server at http://127.0.0.1:5173
```

For everyday use, build once and serve the optimized version:

```bash
npm run build
npm run preview      # http://127.0.0.1:4173
```

Both servers listen on `127.0.0.1` only, so they are not reachable from other machines.

## Desktop app (Windows)

easyPDF is also packaged as a native desktop app with [Tauri](https://tauri.app). It uses the
Microsoft Edge WebView2 runtime that ships with Windows, so the installer is under 4 MB.

**Install:** download the installer from the
[Releases page](https://github.com/Marwan-Alnabhani/EasyPDF/releases) (`easyPDF_<version>_x64-setup.exe`
installs per user, no admin rights needed; an `.msi` is also provided), or build it yourself as below.

**Build it yourself** (needs Rust 1.90+ via [rustup](https://rustup.rs) and the MSVC C++ build tools):

```bash
npm run desktop          # run in a window with hot reload
npm run desktop:build    # produce the installers in src-tauri/target/release/bundle/
```

The app version comes from `package.json` (`src-tauri/Cargo.toml` should be kept in step with it).

In the desktop app, downloads become a native **Save as…** dialog. Drag-and-drop from Explorer works as usual.

Desktop security model:
- The UI has **no file-system, shell or network permissions** (`src-tauri/capabilities/default.json` grants only `core:default`).
- The only native operation it can ask for is `save_file` (`src-tauri/src/lib.rs`): the app shows a Save dialog
  and writes **only to the path you pick**. The UI can never choose a path itself.
- The same strict Content-Security-Policy applies, so the window can't contact the internet.

## Security & privacy

- **No uploads.** PDFs are edited in your browser with [pdf-lib](https://pdf-lib.js.org/) and rendered with
  Mozilla's [pdf.js](https://mozilla.github.io/pdf.js/). There is no backend.
- **No external requests.** pdf.js fonts, CMaps and decoders are bundled locally (`scripts/copy-pdfjs-assets.mjs`).
- **Strict Content-Security-Policy** in production builds: the page can only load its own files and cannot send data anywhere.
  It is defined once in `src-tauri/tauri.conf.json` and shared by the web build and the desktop app.
- All dependencies are free, open-source (MIT / Apache-2.0 / ISC).

## Known limitations

- Unsigned installer: Windows SmartScreen may warn on first run ("More info" → "Run anyway"). Signing needs a code-signing certificate.
- Password-protected PDFs can't be edited yet. Remove the password first.
- Watermark and page-number text uses the built-in PDF fonts, which only support Latin characters.
- "Strong" compression makes text unselectable (pages become images). Use "Lossless" to keep text.
- Tools that build a new document from pages (Organize, Merge, Split, Create PDF, Strong compression) don't
  carry over bookmarks, fillable form fields or file attachments. Watermark, Page Numbers, Metadata and
  Lossless compression edit the original file and keep them.

## Tech

Vite + React + TypeScript · pdf-lib · pdfjs-dist · dnd-kit (drag & drop) · fflate (zip) · lucide-react (icons).

## License

[MIT](LICENSE)
