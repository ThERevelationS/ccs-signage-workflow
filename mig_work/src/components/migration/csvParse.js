// RFC-4180-ish CSV parser for CoreBridge exports. Pure + dependency-free so
// scripts/test-migration-ui.mjs can bundle it under Node.
//
// Handles the cases CB exports actually hit:
//   - quoted fields containing commas and literal newlines
//   - escaped quotes ("" inside a quoted field)
//   - \r\n, \r, and \n line endings, mixed
//   - a UTF-8 BOM on the first byte
//   - trailing newline on the file (no phantom empty row)
//   - blank lines between records (skipped)
//   - short / long data rows vs the header (flagged in warnings)
//   - blank or duplicate header cells (renamed + flagged, never silently kept)
//
// parseCsv(text) -> {
//   columns:   string[]          header names (deduped, never blank)
//   rows:      object[]          one plain object per data row, keyed by column
//   errors:    string[]          unrecoverable structure problems
//   warnings:  string[]          auto-fixes + row-shape anomalies to surface
//   rowCount:  number            rows.length
//   delimiter: "," | "\t" | ";"  detected delimiter
// }

const DELIMITER_CANDIDATES = [",", "\t", ";"];

// Pick the delimiter that produces the most fields on the first non-blank,
// non-quoted line. Comma wins ties so ordinary CSVs never flip delimiter.
function detectDelimiter(text) {
  const firstLine = String(text || "")
    .split(/\r\n|\n|\r/)
    .find((line) => line.trim() !== "") || "";
  let best = ",";
  let bestCount = 0;
  for (const cand of DELIMITER_CANDIDATES) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i += 1) {
      const ch = firstLine[i];
      if (inQuotes) {
        if (ch === '"') {
          if (firstLine[i + 1] === '"') i += 1;
          else inQuotes = false;
        }
        continue;
      }
      if (ch === '"') inQuotes = true;
      else if (ch === cand) count += 1;
    }
    if (count > bestCount) {
      best = cand;
      bestCount = count;
    }
  }
  return best;
}

// Split raw CSV text into an array of field arrays. The state machine walks
// char-by-char: `inQuotes` toggles on a real quote, `afterQuote` means a just-
// closed quote so the next char decides whether it was an escape or a close.
function splitCsvRecords(text, delimiter) {
  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;
  let recordStartLine = 1;
  let line = 1;
  const errors = [];

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push({ cells: record, line: recordStartLine });
    record = [];
  };

  const src = String(text || "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (afterQuote) {
        // A lone quote right after a closed quote that is not an escape --
        // treat as a literal so a stray " does not silently eat the record.
        field += '"';
        afterQuote = false;
      } else if (field === "") {
        inQuotes = true;
      } else {
        // Quote inside an unquoted field: keep it literal (CB exports do
        // produce these) rather than discarding the value.
        field += ch;
      }
      continue;
    }
    afterQuote = false;
    if (ch === delimiter) {
      pushField();
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      pushRecord();
      line += 1;
      recordStartLine = line;
      continue;
    }
    field += ch;
  }
  if (inQuotes) {
    errors.push(`Unclosed quoted field starting on line ${recordStartLine} -- the file may be truncated.`);
  }
  // Flush the last record only when it actually holds content; a file ending
  // in a newline leaves record === [] and must not add a phantom row.
  const hasContent = record.length > 0 || field !== "";
  if (hasContent) pushRecord();
  return { records, errors };
}

const isBlankRecord = (cells) =>
  cells.length === 0 || cells.every((c) => String(c ?? "").trim() === "");

// Header cells are trimmed and made unique/non-blank so downstream mapping can
// key rows by name. Renames are reported so the UI can show them honestly.
function normalizeHeaders(cells) {
  const warnings = [];
  const seen = new Map();
  const columns = cells.map((raw, i) => {
    let name = String(raw ?? "").replace(/^\uFEFF/, "").trim();
    if (!name) {
      name = `column_${i + 1}`;
      warnings.push(`Blank header at position ${i + 1} renamed to "${name}".`);
    }
    const key = name.toLowerCase();
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n > 1) {
      const renamed = `${name}_${n}`;
      warnings.push(`Duplicate header "${name}" renamed to "${renamed}".`);
      return renamed;
    }
    return name;
  });
  return { columns, warnings };
}

export function parseCsv(text) {
  const warnings = [];
  const src = String(text || "").replace(/^\uFEFF/, "");
  if (!src.trim()) {
    return { columns: [], rows: [], errors: ["The file is empty."], warnings, rowCount: 0, delimiter: "," };
  }
  const delimiter = detectDelimiter(src);
  const { records, errors } = splitCsvRecords(src, delimiter);
  const data = (records || []).filter((r) => !isBlankRecord(r.cells));
  if (!data.length) {
    return { columns: [], rows: [], errors: ["No header row was found in the file."], warnings, rowCount: 0, delimiter };
  }

  const head = normalizeHeaders(data[0].cells);
  const columns = head.columns;
  warnings.push(...head.warnings);

  const rows = [];
  let shortRows = 0;
  let longRows = 0;
  for (let i = 1; i < data.length; i += 1) {
    const cells = data[i].cells;
    if (cells.length < columns.length) shortRows += 1;
    if (cells.length > columns.length) longRows += 1;
    const row = {};
    for (let c = 0; c < columns.length; c += 1) {
      row[columns[c]] = cells[c] !== undefined ? String(cells[c]) : "";
    }
    // Keep the physical CSV line so error tables can point at it later.
    Object.defineProperty(row, "__line", {
      value: data[i].line, enumerable: false, writable: false, configurable: true,
    });
    rows.push(row);
  }
  if (shortRows) warnings.push(`${shortRows} row(s) had fewer fields than the header -- missing cells were left blank.`);
  if (longRows) warnings.push(`${longRows} row(s) had extra fields beyond the header -- trailing cells were dropped.`);

  return { columns, rows, errors, warnings, rowCount: rows.length, delimiter };
}

// Convenience: first non-empty data cell of a column for the mapping table's
// "sample" column.
export function firstValueForColumn(rows, column) {
  for (const row of rows || []) {
    const v = String(row?.[column] ?? "").trim();
    if (v) return v;
  }
  return "";
}
