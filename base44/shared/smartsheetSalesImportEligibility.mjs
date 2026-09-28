const clean = (value) => String(value ?? "").trim();

export function hasMeaningfulSmartsheetSalesCustomer(fields = {}) {
  const customer = clean(fields?.client_name);
  return Boolean(customer) && customer.toLowerCase() !== "unknown";
}

export function isSmartsheetSalesImportShell(record = {}) {
  const rowId = clean(record?.smartsheet_row_id);
  if (!/^\d+$/.test(rowId)) return false;
  return clean(record?.client_name).toLowerCase() === "unknown" &&
    clean(record?.title) === `Smartsheet row ${rowId}`;
}
