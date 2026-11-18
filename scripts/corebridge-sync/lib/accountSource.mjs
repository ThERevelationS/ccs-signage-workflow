import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class AccountParserUnavailable extends Error {
  constructor() {
    super('Account detail capture and parsing are not available yet.');
    this.name = 'AccountParserUnavailable';
  }
}

export async function fetchAccount(_session, _id, _options = {}) {
  throw new AccountParserUnavailable();
}

export async function captureAccountFixture(session, accountListHref, accountId, directory) {
  if (!accountListHref || !/^\d+$/.test(String(accountId))) throw new Error('Account list link or account ID is unavailable.');
  const listing = await session.request(accountListHref);
  if (/login\.aspx/i.test(listing.headers.get('location') || '')) throw new Error('CoreBridge session expired.');
  if (!listing.ok) throw new Error(`Account list returned HTTP ${listing.status}.`);
  const html = await listing.text();
  const links = [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1].replace(/&amp;/g, '&'));
  const id = String(accountId);
  const link = links.find((value) => new RegExp(`[?&](?:accountId|acctId)=${id}(?:&|$)`, 'i').test(value));
  if (!link) throw new Error(`Account ${id} link was not found on the account listing.`);
  const page = await session.request(link);
  if (/login\.aspx/i.test(page.headers.get('location') || '')) throw new Error('CoreBridge session expired.');
  if (!page.ok) throw new Error(`Account detail returned HTTP ${page.status}.`);
  await mkdir(directory, { recursive: true });
  const path = join(directory, `account-${id}.html`);
  await writeFile(path, await page.text(), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return path;
}
