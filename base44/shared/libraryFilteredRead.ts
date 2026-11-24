const LIBRARY_SCAN_PAGE = 1000;
const LIBRARY_SCAN_CAP = 5000;

export async function loadVisibleLibraryRows({
  entity, query, sort, fields, canSee,
}: {
  entity: any;
  query: any;
  sort?: string;
  fields?: string[] | null;
  canSee: (row: any) => boolean;
}) {
  const visible: any[] = [];
  let scanned = 0;
  while (scanned < LIBRARY_SCAN_CAP) {
    // Field narrowing happens response-side — the deployed entity runtime
    // rejects server-side field projections on the options-object read.
    void fields;
    const page = query
      ? await entity.filter(query, sort || null, LIBRARY_SCAN_PAGE, scanned)
      : await entity.list(sort || null, LIBRARY_SCAN_PAGE, scanned);
    const rows = Array.isArray(page) ? page : page?.items;
    if (!Array.isArray(rows)) throw new Error('Library rows could not be read completely.');
    scanned += rows.length;
    if (scanned >= LIBRARY_SCAN_CAP) {
      throw Object.assign(new Error('This library is too large to filter; ask an admin.'), { status: 413 });
    }
    visible.push(...rows.filter(canSee));
    const more = !Array.isArray(page) && (page?.has_more === true || Boolean(page?.next_cursor));
    if (more && rows.length === 0) throw new Error('Library rows could not be read completely.');
    if (!more && rows.length < LIBRARY_SCAN_PAGE) return visible;
  }
  return visible;
}
