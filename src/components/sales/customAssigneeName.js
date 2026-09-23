export function validateCustomAssigneeName(value) {
  const name = String(value ?? "").trim();
  if (!name) throw new Error("Enter an assigned name.");
  if (name.length > 100) throw new Error("Use 100 characters or fewer.");
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error("Use a single-line name without control characters.");
  return name;
}