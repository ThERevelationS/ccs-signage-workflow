const FORMULA_LEAD = /^[\t\r]|^\s*[=+\-@]/;
const PLAIN_NUMBER = /^\s*-?\d+(\.\d+)?\s*$/;

// Prefix spreadsheet-formula-looking text with ' so Excel/Sheets treat it as literal (CWE-1236).
export const csvCell = (value) => {
  let s = value == null ? "" : String(value);
  if (typeof value !== "number" && FORMULA_LEAD.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const downloadCsv = (filename, headers, rows) => {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
