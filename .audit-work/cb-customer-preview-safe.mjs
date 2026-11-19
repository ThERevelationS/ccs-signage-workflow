import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const creds = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const plan = JSON.parse(readFileSync('.audit-work/cb-inv-plan.json', 'utf8'));
const customer = plan.invoices.find((row) => row.data.customer_display_name === 'Bridgewater Church')?.data.customer_id;
if (!customer) throw new Error('Bridgewater customer missing from plan.');
const response = await fetch('https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions/verifyLogin', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: creds.user, password: creds.pass }),
});
const login = await response.json();
if (!response.ok || !login.token) throw new Error(`Staff login failed: HTTP ${response.status}`);
const browser = await chromium.launch({ headless: true, executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1248/chrome-win64/chrome.exe` });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const failures = [];
await page.addInitScript((token) => {
  localStorage.setItem('sss_session_token', token);
  localStorage.setItem('base44_server_url', location.origin);
}, login.token);
await page.route('**/api/**', async (route) => {
  const request = route.request();
  if (['GET', 'HEAD'].includes(request.method())) return route.continue();
  const path = new URL(request.url()).pathname;
  const name = path.match(/\/functions\/([^/]+)$/)?.[1];
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch {}
  const allowed = name === 'staffDataRead'
    || (name === 'verifySession' && body.action !== 'logout')
    || (name === 'opportunityWorkspaceAction' && body.action === 'get_customer_360')
    || (name === 'customerHistoryFeed' && body.action === 'get');
  return allowed ? route.continue() : route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Preview read-only restriction"}' });
});
page.on('response', (res) => {
  const url = new URL(res.url());
  if (res.status() >= 400 && url.pathname.includes('/api/')) failures.push({ status: res.status(), path: url.pathname });
});
try {
  await page.goto(`http://127.0.0.1:4175/EstimatorCustomers?customer=${encodeURIComponent(customer)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const customerRow = page.locator('[role="button"]').filter({ hasText: 'Bridgewater Church' }).first();
  await customerRow.waitFor({ state: 'visible', timeout: 90000 });
  await customerRow.getByText('Bridgewater Church', { exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Customer statement' });
  await dialog.waitFor({ state: 'visible', timeout: 30000 });
  await dialog.getByText(/^Estimates \(\d/).waitFor({ state: 'visible', timeout: 90000 });
  for (const name of ['Estimates', 'Jobs / Work orders', 'Invoices']) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (await dialog.getByText(new RegExp(`^${escaped} \\(\\d`)).count() !== 1) throw new Error(`${name} count missing`);
  }
  await page.screenshot({ path: '.audit-work/cb-customer-preview-safe-3.png', fullPage: true });
  console.log('PASS read-only local preview: Bridgewater popup shows all three counts; screenshot .audit-work/cb-customer-preview-safe-3.png');
} catch (error) {
  await page.screenshot({ path: '.audit-work/cb-customer-preview-safe-error-3.png', fullPage: true });
  console.error(JSON.stringify({ failures }));
  throw error;
} finally {
  await browser.close();
}
