// Bounded file readers for operational dashboards/flushers.
// Operational JSONL files are append-only and can outgrow V8's string cap.
// These helpers never materialize a whole unbounded file: exact counts stream
// in fixed-size chunks; large-file counts are size estimates from bounded
// head/tail samples.
import { openSync, closeSync, readSync, statSync, copyFileSync, truncateSync } from 'node:fs';

export const JSONL_EXACT_LIMIT = 10 * 1024 * 1024;
export const JSONL_SAMPLE_BYTES = 64 * 1024;

function readPart(fd, position, length) {
  const buf = Buffer.alloc(length);
  const got = readSync(fd, buf, 0, length, position);
  return buf.subarray(0, got);
}

// Exact non-empty-line count, byte-oriented so multi-byte UTF-8 never affects
// newline detection. Whitespace-only lines are ignored, matching the historic
// `.trim().split('\n').filter(Boolean)` counters.
function countJsonlExactFd(fd, size, chunkBytes) {
  const buf = Buffer.allocUnsafe(chunkBytes);
  let pos = 0, count = 0, lineHasContent = false;
  while (pos < size) {
    const got = readSync(fd, buf, 0, Math.min(chunkBytes, size - pos), pos);
    if (!got) break;
    for (let i = 0; i < got; i++) {
      const b = buf[i];
      if (b === 10) { // \n
        if (lineHasContent) count++;
        lineHasContent = false;
      } else if (b > 32) lineHasContent = true;
    }
    pos += got;
  }
  if (lineHasContent) count++;
  return count;
}

function sampleLineLengths(buf, discardFirstPartial) {
  const lengths = [];
  let start = 0;
  if (discardFirstPartial) {
    let firstNl = -1;
    for (let i = 0; i < buf.length; i++) if (buf[i] === 10) { firstNl = i; break; }
    if (firstNl < 0) return lengths;
    start = firstNl + 1;
  }
  let lineStart = start;
  for (let i = start; i < buf.length; i++) {
    if (buf[i] !== 10) continue;
    let content = false;
    for (let j = lineStart; j < i; j++) if (buf[j] > 32) { content = true; break; }
    if (content) lengths.push(i - lineStart + 1); // bytes including the newline
    lineStart = i + 1;
  }
  return lengths;
}

// Count a JSONL file without ever loading it wholesale. Files at/below
// exactBytes are counted exactly. Above that, return a size/avg-line-length
// estimate from ≤2 sample chunks (default 64KB each). The estimate is for
// dashboard depth display; correctness-sensitive consumers must use the real
// queue rather than this count.
export function countJsonlLines(file, { exactBytes = JSONL_EXACT_LIMIT, sampleBytes = JSONL_SAMPLE_BYTES, chunkBytes = 64 * 1024 } = {}) {
  let st;
  try { st = statSync(file); } catch { return { count: 0, estimated: false, bytes: 0 }; }
  const size = st.size;
  if (!size) return { count: 0, estimated: false, bytes: 0 };
  let fd;
  try {
    fd = openSync(file, 'r');
    if (size <= exactBytes) {
      return { count: countJsonlExactFd(fd, size, chunkBytes), estimated: false, bytes: size };
    }
    const head = readPart(fd, 0, Math.min(sampleBytes, size));
    const tail = readPart(fd, Math.max(0, size - sampleBytes), Math.min(sampleBytes, size));
    const lengths = [...sampleLineLengths(head, false), ...sampleLineLengths(tail, true)];
    if (!lengths.length) {
      // No complete line in either sample (or a sparse zero-filled file): the
      // safest bounded estimate is one very long line.
      return { count: 1, estimated: true, bytes: size, avg_line_bytes: size };
    }
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    return { count: Math.max(1, Math.round(size / avg)), estimated: true, bytes: size, avg_line_bytes: avg };
  } catch {
    return { count: 0, estimated: false, bytes: size, error: true };
  } finally {
    if (fd != null) try { closeSync(fd); } catch {}
  }
}

// Stream the top-level `rows` array of a mirror JSON file without parsing the
// whole snapshot. Mirror files are one large JSON object; this scanner finds
// object rows by brace depth while respecting strings/escapes, so peak memory
// is bounded by one row (capped) rather than file size. Rows over maxRowBytes
// are skipped but counted.
// Copy+truncate rotation for append-only files whose writers keep persistent
// fds. Unlike rename rotation, the fd stays attached to the live path. There
// is no safe portable way to remove a prefix while writers keep appending, so
// a handful of lines written during the sub-second copy can be lost; event
// logs are forensic/telemetry, not a correctness ledger.
export function rotateAppendFileCopyTruncate(file, dest, maxBytes) {
  try {
    const st = statSync(file);
    if (st.size <= maxBytes) return false;
    copyFileSync(file, dest);
    truncateSync(file, 0);
    return true;
  } catch { return false; }
}

export function scanJsonRows(file, onRow, { chunkBytes = 64 * 1024, maxRowBytes = 16 * 1024 * 1024 } = {}) {
  const st = statSync(file);
  const fd = openSync(file, 'r');
  const buf = Buffer.allocUnsafe(chunkBytes);
  const rowBuf = Buffer.allocUnsafe(maxRowBytes);
  let pos = 0, phase = 0, depth = 0, inString = false, escape = false;
  let rowBytes = 0, rowOverflow = false, rows = 0, skippedRows = 0;
  let keyWindow = '';
  const finishRow = () => {
    if (!rowOverflow) {
      const row = JSON.parse(rowBuf.toString('utf8', 0, rowBytes));
      rows++;
      onRow(row);
    } else skippedRows++;
    rowBytes = 0; rowOverflow = false;
  };
  try {
    while (pos < st.size) {
      const got = readSync(fd, buf, 0, Math.min(chunkBytes, st.size - pos), pos);
      if (!got) break;
      for (let i = 0; i < got; i++) {
        const b = buf[i];
        if (phase === 0) {
          // `"rows"` is ASCII; a 6-byte sliding window is enough and survives chunk boundaries.
          keyWindow = (keyWindow + String.fromCharCode(b)).slice(-6);
          if (keyWindow === '"rows"') phase = 1;
          continue;
        }
        if (phase === 1) {
          if (b === 91) phase = 2; // [
          else if (b > 32 && b !== 58) throw new Error('rows key is not an array');
          continue;
        }
        if (phase === 2) {
          if (b <= 32 || b === 44) continue; // whitespace/comma
          if (b === 93) return { rows, skippedRows, bytes: st.size }; // ]
          if (b !== 123) throw new Error('mirror row is not an object');
          phase = 3; depth = 1; inString = false; escape = false; rowBytes = 0; rowOverflow = false;
          rowBuf[rowBytes++] = b;
          continue;
        }
        // Inside a row object. Keep only maxRowBytes; state tracking continues
        // even when overflowing so the following rows remain aligned.
        if (!rowOverflow) {
          if (rowBytes < maxRowBytes) rowBuf[rowBytes++] = b;
          else rowOverflow = true;
        }
        if (inString) {
          if (escape) escape = false;
          else if (b === 92) escape = true;
          else if (b === 34) inString = false;
          continue;
        }
        if (b === 34) { inString = true; continue; }
        if (b === 123) depth++;
        else if (b === 125) {
          depth--;
          if (depth === 0) { finishRow(); phase = 2; }
        }
      }
      pos += got;
    }
    return { rows, skippedRows, bytes: st.size, truncated: true };
  } finally {
    try { closeSync(fd); } catch {}
  }
}
