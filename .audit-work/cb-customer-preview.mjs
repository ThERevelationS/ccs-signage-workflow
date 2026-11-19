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
page.on('response', (res) => {
  if (res.status() >= 400) {
    const url = new URL(res.url());
    failures.push({ status: res.status(), path: url.pathname });
  }
});
await page.addInitScript((token) => localStorage.setItem('sss_session_token', token), login.token);
try {
  await page.goto(`http://127.0.0.1:4175/EstimatorCustomers?customer=${encodeURIComponent(customer)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const customerRow = page.locator('[role="button"]').filter({ hasText: 'Bridgewater Church' }).first();
  await customerRow.waitFor({ state: 'visible', timeout: 30000 });
  await customerRow.click();
  const dialog = page.getByRole('dialog', { name: 'Customer statement' });
  await dialog.waitFor({ state: 'visible', timeout: 30000 });
  await dialog.getByText(/^Estimates \(\d/).waitFor({ state: 'visible', timeout: 90000 });
  for (const name of ['Estimates', 'Jobs / Work orders', 'Invoices']) {
    if (await dialog.getByText(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(\\d`)).count() !== 1) throw new Error(`${name} count missing`);
  }
  await page.screenshot({ path: '.audit-work/cb-customer-preview.png', fullPage: true });
  console.log('PASS customer preview: Bridgewater popup shows estimates, jobs and invoice counts; screenshot .audit-work/cb-customer-preview.png');
} catch (error) {
  await page.screenshot({ path: '.audit-work/cb-customer-preview-error.png', fullPage: true });
  const state = await page.evaluate(() => ({ has_session: Boolean(localStorage.getItem('sss_session_token')), app_id: localStorage.getItem('base44_app_id'), server_url: localStorage.getItem('base44_server_url') }));
  console.error(JSON.stringify({ failures, state }));
  throw error;
} finally {
  await browser.close();
}
