# FileBridge openability matrix

How the bridge decides what "open" means per file type, and how the live
`FileBridgeInventory` report measures it (counts measured, not guessed).

## Rendering tiers (FileViewerDialog)

| `open_state` | Kinds | Behavior |
|---|---|---|
| `inline` | `image` | `<img>` tag on `delivered_url`. |
| `inline` | `pdf` | `<iframe>` on `delivered_url` (browser PDF viewer). |
| `inline` | `text` | Fetch text (≤512KB) → `<pre>`; larger → download. |
| `inline` | `video` | Native `<video controls>` (mp4/webm/mov etc.). |
| `inline` | `audio` | Native `<audio controls>`. |
| `download` | `office`, `archive`, `font`, `design`, `other` | Honest fallback card + Download/Open-externally button. No fake preview. |

## Kind map (agent `EXT_KIND`)

- **image** — jpg jpeg png gif webp svg bmp tif tiff heic
- **pdf** — pdf
- **text** — txt md log csv json xml js ts jsx tsx css html
- **video** — mp4 mov webm mkv avi m4v
- **audio** — mp3 wav ogg m4a flac aac
- **office** — doc docx xls xlsx ppt pptx odt ods rtf
- **archive** — zip rar 7z tar gz
- **font** — ttf otf woff woff2
- **design** — ai psd eps indd cdr skp dwg dxf step stl
- **other** — everything else / no extension

## Content-searchable (extraction)

`EXTRACTABLE_EXTS` on the agent — text-ish types scanned into `content_fts`
(FTS5): `txt md log csv tsv json jsonl xml html htm css js mjs cjs ts tsx jsx
ini cfg conf yaml yml env sh bat ps1 sql graphql svg srt vtt`.

Rules: file ≤2MB read, ≤64KB text kept, binary sniff (>5% control bytes in
first 8KB → skip), re-extract only on mtime change, ≤500 files per scan pass
(extraction never starves metadata). Gated per root by
`extraction_enabled`/`extraction_roots` + global `content_search`.

`deep_search` merges name/path hits (`match:'name'`) and content hits
(`match:'content'` + `snippet()` context) — deduped by rowid, name lane first.

## Delivery caps (measured, enforced)

- Inline `deliver_complete`: ≤48MB (body cap measured ~89MB b64, capped lower
  for headroom).
- `deliver_chunk` staged: 32MB chunks, ≤64 seqs, ≤256MB assembled. Auto-stitch
  on last chunk; `deliver_stitch` re-attempts assembly without re-upload.
- `package_files`: STORE zip, ≤240MB total.

## Live measurement

After each scan the agent posts `inventory_report` → `FileBridgeInventory`
row: `ext_map{ext:{count,bytes,kind,open_state}}`, `totals`, `top_dirs`,
`errors`. This is the source of truth for "what can we actually open" on the
real dataset — the next viewer/renderer additions should target the largest
`open_state:'download'` kinds by count.
