import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseAccount } from './accountParser.mjs';

async function readAccountPage(session, id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid CoreBridge account ID.');
  const response = await session.request(`/SalesModule/Accounts/Account.aspx?AcctId=${id}`);
  if (/login\.aspx/i.test(response.headers.get('location') || '')) throw new Error('CoreBridge session expired.');
  if ([404, 500].includes(response.status)) return null;
  if (!response.ok) throw new Error(`CoreBridge account read failed: HTTP ${response.status}.`);
  const html = await response.text();
  if (/name=["']txtPassword["']/i.test(html)) throw new Error('CoreBridge session expired.');
  return html;
}

async function writeFixture(directory, id, html) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, `account-${id}.html`);
  await writeFile(path, html, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return path;
}

export async function fetchAccount(session, id, { captureDirectory = '' } = {}) {
  const html = await readAccountPage(session, id);
  if (html === null) return null;
  const account = parseAccount(html, id);
  if (captureDirectory) await writeFixture(captureDirectory, id, html);
  return account;
}

export async function captureAccountFixture(session, _accountListHref, accountId, directory) {
  const id = Number(accountId);
  const html = await readAccountPage(session, id);
  if (html === null) throw new Error(`Account ${id} was not found.`);
  return writeFixture(directory, id, html);
}
