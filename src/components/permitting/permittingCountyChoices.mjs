export async function readAllCountyChoices(readPage, isCurrent = () => true) {
  const values = new Set(), cursors = new Set(); let cursor;
  while (true) {
    if (!isCurrent()) throw Error('County read superseded');
    const page = await readPage(cursor);
    if (!isCurrent()) throw Error('County read superseded');
    if (!Array.isArray(page?.items) || typeof page.has_more !== 'boolean') throw Error('Invalid county choice page');
    for (const value of page.items) {
      if (typeof value !== 'string') throw Error('Invalid county choice');
      if (value.trim()) values.add(value.trim());
    }
    if (!page.has_more) return [...values].sort();
    if (!page.next_cursor || cursors.has(page.next_cursor)) throw Error('County cursor did not advance');
    cursors.add(page.next_cursor); cursor = page.next_cursor;
  }
}
