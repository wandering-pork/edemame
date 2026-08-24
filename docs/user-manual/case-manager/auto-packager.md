# Preparing documents for ImmiAccount (Auto-Packager)

The Department of Home Affairs accepts attachments up to **5 MB each** in a limited set of file
types (PDF, JPG, PNG, DOCX, and a few others). Scanned evidence bundles routinely blow past
that limit, so Edamame includes tools to compress, rename, and organise documents before you
upload them to ImmiAccount — entirely on your own machine, nothing is sent to a server.

Case Files itself accepts uploads up to **50 MB** (not the DoHA 5 MB ceiling) — that ceiling only
applies to what you actually attach in ImmiAccount, so there's room to land an oversized scan or
evidence bundle in Case Files before compressing it. Any file already sitting in Case Files between
5 MB and 50 MB shows a persistent amber warning that it will be rejected by DoHA until compressed.
Uploading something over 50 MB is rejected outright, with an option to send it straight to
Auto-Packager instead of re-browsing for it.

## Auto-Packager (recommended for most cases)

Open a case, click the **⋯** menu in the top bar, and choose **Auto-Packager**. It starts by asking
where the files are:

- **Compress files in Case Files** — works from documents already uploaded to this case. Files
  over 5 MB in a supported format are automatically selected (and sorted to the top of the list, or
  auto-assigned into the checklist slot when there's only one).
- **Compress files from your local PC** — opens a picker straight to your computer, for files that
  never made it into Case Files (e.g. because they were too large, or you just haven't uploaded
  them yet). Only PDF/JPG/PNG/DOCX can be selected; anything else shows an error naming the
  supported formats.

(If you arrived here via a Case Files upload that was rejected for being too large, this source
screen is skipped — Auto-Packager opens directly with that file loaded.)

From there it walks through four steps:

1. **Assign** — the case's document checklist (generated from the visa subclass template, e.g.
   186/482/490/820) appears as a set of slots on the left; the source files appear as a pool on the
   right. Drag a document onto the slot it belongs to. Files already under 5 MB are accepted
   immediately; oversized ones show an amber warning icon. Drop a document back into the pool to
   unassign it. Use **Change source** in the footer to switch between Case Files and local PC.
2. **Size Dashboard** — once you continue, Edamame analyses every assigned file and shows a
   before/after size for each, plus a summary line such as "3 of 7 files need compression.
   Estimated total before: 42 MB → after: 18 MB." Files it couldn't shrink further (e.g. an
   already-oversized DOCX) are flagged for manual attention — these formats can't be
   safely compressed in the browser, only detected.
3. **Naming** — each output file gets an auto-suggested ImmiAccount-friendly name (applicant
   surname + document type + today's date). Edit any name before continuing.
4. **Output** — choose whether to add the packaged files straight into this case's Case Files
   (writes to your linked folder in local mode, or cloud storage in cloud mode), or download them
   to your computer instead. Click **Compress & Package** to finish.

### What gets compressed, and how

- **PDFs** are losslessly recompressed (metadata stripped, optimal internal encoding chosen).
  Downsampling images embedded inside a PDF isn't possible in the browser today — if a scanned PDF
  is still over 5 MB afterwards, split it into more than one upload or re-scan at a lower
  resolution (150 DPI is enough for ImmiAccount).
- **Images** (JPG, PNG, and legacy BMP/GIF) are resized and re-encoded as JPG, targeting the
  Department's recommended ~500 KB per image. BMP and GIF are always converted to JPG.
- **DOCX / XLSX / TXT and other formats** can't be compressed client-side (there's no in-browser
  Word/Excel engine). The Auto-Packager only flags these if they're already over 5 MB — recreate
  them with smaller embedded images, or export to PDF first.

## Other packaging tools

- **Run Crusher** (5MB Crusher) — a quicker path for a straight PDF merge-and-compress when you
  don't need the checklist/drag-drop flow. Pick which uploaded PDFs to bundle, then download the
  merged file — it always targets the DoHA 5 MB ceiling.
- **820 bundle builder** — for Partner (820/801) cases specifically, builds one PDF per "aspect of
  the relationship" (financial, household, social, commitment, etc.) from documents already tagged
  with that aspect in the Documents tab, auto-splitting any aspect whose evidence exceeds 5 MB.
