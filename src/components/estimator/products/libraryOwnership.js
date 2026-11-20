export const ownerOf = (row) => String(row?.owner_email || "").trim().toLowerCase();

export const isLegacyUnowned = (row) => !ownerOf(row);

export function isLibraryOwner(row, user) {
  const owner = ownerOf(row);
  return !owner || owner === String(user?.email || "").trim().toLowerCase();
}

export const canSeeLibraryItem = (row, user) =>
  row?.product_group === "global" || isLibraryOwner(row, user);

export const canEditLibraryItem = (row, user) =>
  user?.role === "admin" || isLibraryOwner(row, user);
