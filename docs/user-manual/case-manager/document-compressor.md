# Preparing documents for ImmiAccount (Document Compressor)

The Department of Home Affairs accepts attachments up to **5 MB each** in a limited set of file
types (PDF, JPG, PNG, DOCX, and a few others). Scanned evidence routinely blows past that limit, so
Edamame includes the Document Compressor to shrink individual documents before you upload them to
ImmiAccount — entirely on your own machine, nothing is sent to a server. It doesn't bundle or
package documents together; DoHA only cares that each attachment on its own is under 5 MB, so each
file you run through it is compressed on its own.

Case Files itself accepts uploads up to **50 MB** (not the DoHA 5 MB ceiling) — that ceiling only
applies to what you actually attach in ImmiAccount, so there's room to land an oversized scan in
Case Files before compressing it. Any file already sitting in Case Files between 5 MB and 50 MB
shows a persistent amber warning that it will be rejected by DoHA, with a **Compress** link next to
it that opens the Document Compressor with that file pre-selected. Uploading something over 50 MB
to Case Files is rejected outright, with an option to send it straight to the Document Compressor
instead of re-browsing for it.

## Using the Document Compressor

Open a case, click the **⋯** menu in the top bar (or the **Document Compressor** tile on the
Workspace tab), and choose **Document Compressor**. It starts by asking where the files are:

- **Compress files in Case Files** — works from documents already uploaded to this case. Files
  over 5 MB in a supported format are automatically ticked for you.
- **Compress files from your local PC** — opens a picker straight to your computer, for files that
  never made it into Case Files (e.g. because they were too large, or you just haven't uploaded
  them yet). Only PDF/JPG/PNG/DOCX can be selected; anything else shows an error naming the
  supported formats.

(If you arrived here via a Case Files upload that was rejected for being too large, or the
**Compress** link on an oversized row, this source screen is skipped and the tool opens straight
into Step 1 with those file(s) already loaded.)

From there it walks through three steps:

1. **Select & Check** — every file in the chosen source is listed with its format and size. Files
   over 5 MB in a supported format are ticked automatically; you can tick/untick freely. A file
   already under 5 MB shows a green "already meets requirement, no need to compress" label and
   isn't ticked by default, but you can still tick it if you want. A file in an unsupported format
   shows a red "format is not eligible for compressing" flag and can't be ticked. If nothing in the
   source is an eligible format at all, the screen tells you so and lets you exit.
2. **Compress** — every ticked file is compressed on its own (never bundled with any other file).
   Each result lands in one of three states:
   - **Under 5 MB** — success, ticked automatically to continue to Step 3.
   - **5–50 MB** — a warning that DoHA will likely reject it, left unticked; you can still tick it
     yourself if you want to save or download it anyway.
   - **Still over 50 MB** — a hard failure. This file cannot continue to Step 3 at all, which is
     what stops an oversized file from ever reaching Case Files by going through the compressor —
     if nothing in the batch got under 50 MB, the screen tells you so and lets you exit or go back
     and pick different files.
3. **Save or Download** — each file that continued gets an editable, auto-suggested name (original
   file name + today's date). **Save to Case Files** and **Download** are independent per file, so
   you can do either, both, or move on to the next file — trying to save a name that's already
   used in Case Files (or elsewhere in this batch) prompts you to rename it first. A file still
   flagged from the 5–50 MB warning tier keeps its warning icon here as a reminder even though
   Case Files will accept it. **Complete** (bottom-right) exits the tool at any time.

### What gets compressed, and how

- **PDFs** are losslessly recompressed first (metadata stripped, optimal internal encoding
  chosen). If that's not enough, pages are rasterized and re-encoded as reduced-DPI/quality JPEGs
  (the text layer is no longer selectable, an accepted tradeoff for what was already a scan) and
  reassembled into a new PDF, iterating resolution/quality down until it fits or the safety floor
  (72 DPI / JPEG quality 0.4) is hit.
- **Images** (JPG, PNG, and legacy BMP/GIF) are resized and re-encoded as JPG, targeting the
  Department's recommended ~500 KB per image. BMP and GIF are always converted to JPG.
- **DOCX / XLSX / TXT and other formats** can't be compressed client-side (there's no in-browser
  Word/Excel engine). The Document Compressor only flags these if they're already over 5 MB —
  recreate them with smaller embedded images, or export to PDF first.

## Other packaging tools

- **Run Crusher** (5MB Crusher) — a quicker path for a straight PDF merge-and-compress when you
  don't need the per-file review flow. Pick which uploaded PDFs to bundle, then download the
  merged file — it always targets the DoHA 5 MB ceiling.
- **820 bundle builder** — for Partner (820/801) cases specifically, builds one PDF per "aspect of
  the relationship" (financial, household, social, commitment, etc.) from documents already tagged
  with that aspect in the Documents tab, auto-splitting any aspect whose evidence exceeds 5 MB.
