// Emits a sandbox-edit JSON payload on stdout from an edits module.
// Usage: node .remote/mkedit.mjs .remote/edits/invoices.mjs | npx base44@latest sandbox edit <path> --app-id ... --branch main --json [--dry-run]
// Non-ASCII chars are emitted as \uXXXX INSIDE the JSON text so Windows stdin
// decoding can't mangle them (JSON.parse restores the real characters).
import { pathToFileURL } from "node:url";

const mod = await import(pathToFileURL(process.argv[2]).href);
const edits = mod.default;

// Hand-rolled JSON string encoder: identical output to JSON.stringify for
// ASCII, but escapes every non-ASCII char to \uXXXX so the payload is pure
// ASCII bytes end-to-end.
const jsonStr = (s) =>
  '"' +
  [...s]
    .map((c) => {
      const code = c.codePointAt(0);
      if (c === '"') return '\\"';
      if (c === "\\") return "\\\\";
      if (c === "\n") return "\\n";
      if (c === "\r") return "\\r";
      if (c === "\t") return "\\t";
      if (code < 0x20 || code > 0x7e)
        return `\\u${code.toString(16).padStart(4, "0")}`;
      return c;
    })
    .join("") +
  '"';

const payload =
  "[" +
  edits
    .map(
      (e) =>
        `{"old_text":${jsonStr(e.old)},"new_text":${jsonStr(e.new)}` +
        (e.all ? ',"replace_all":true' : "") +
        "}"
    )
    .join(",") +
  "]";
process.stdout.write(payload);
