#!/usr/bin/env node
// Convert generated LF edits-json to CRLF for files that are w/crlf on disk.
// The read API normalizes content to LF; edit matches raw bytes.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = ".audit-work/foundation-o012-handoff";
const J = path.join(DIR, "edits-json");

// file -> { eofNewline: remote file ends with EOL (consume it in old_text) }
const CRLF_FILES = {
  "foundationSyncRecovery.js": { eofNewline: true },
  "EstimateDetail.jsx": { eofNewline: false },
  "partSync.js": { eofNewline: false },
};

for (const [name, opts] of Object.entries(CRLF_FILES)) {
  const p = path.join(J, name + ".edits.json");
  const edits = JSON.parse(readFileSync(p, "utf8"));
  const out = edits.map((e) => {
    let o = e.old_text.replace(/\n/g, "\r\n");
    let n = e.new_text.replace(/\n/g, "\r\n");
    if (opts.eofNewline) {
      // pulled read strips the trailing EOL; disk has it — consume + resupply
      o += "\r\n";
      n += "\r\n";
    }
    return { old_text: o, new_text: n, replace_all: false };
  });
  writeFileSync(path.join(J, name + ".edits-crlf.json"), JSON.stringify(out));
  console.log("wrote", name + ".edits-crlf.json", out.length, "edits");
}
