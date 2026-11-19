import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const creds = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const plan = JSON.parse(readFileSync('.audit-work/cb-inv-plan.json', 'utf8'));
const customer = plan.invoices.find((row) => row.data.customer_display_name === 'Bridgewater Church')?.data.customer_id;
if (!customer) throw new Error('Customer missing from plan.');
const loginResponse = await fetch('https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions/verifyLogin', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: creds.user, password: creds.pass }),
});
const login = await loginResponse.json();
if (!loginResponse.ok || !login.token) throw new Error(`Login failed: ${loginResponse.status}`);
const browser = await chromium.launch({ headless: true, executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1248/chrome-win64/chrome.exe` });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
await page.addInitScript((token) => {
  localStorage.setItem('sss_session_token', token);
  localStorage.setItem('base44_server_url', location.origin);
}, login.token);
await page.route('**/api/**', async (route) => {
  const request = route.request();
  if (['GET', 'HEAD'].includes(request.method())) return route.continue();
  const name = new URL(request.url()).pathname.match(/\/functions\/([^/]+)$/)?.[1];
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch {}
  if (name === 'opportunityWorkspaceAction' && body.action === 'get_customer_360') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      success: true,
      customer: { id: customer, company_name: 'Synthetic Customer' },
      summary: {},
      estimate_funnel: { approved: 7, draft: 2 },
      invoices: [{ id: 'overdue-invoice', days_overdue: 37 }, { id: 'paid-invoice', days_overdue: 70 }],
      contacts: [], locations: [], opportunities: [], payments: [],
    }) });
  }
  if (name === 'customerHistoryFeed' && body.action === 'get') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      success: true, totals: { estimates: 0, jobs: 0, invoices: 3 },
      truncated: { estimates: false, jobs: false, invoices: false }, estimates: [], jobs: [],
      invoices: [
        { id: 'overdue-invoice', invoice_number: 'SYN-1', status: 'sent', total: 200, balance_due: 100, issue_date: '2026-01-01' },
        { id: 'paid-invoice', invoice_number: 'SYN-2', status: 'paid', total: 200, balance_due: 0, issue_date: '2026-01-02' },
        { id: 'unmatched-invoice', invoice_number: 'SYN-3', status: 'sent', total: 200, balance_due: 20, issue_date: '2026-01-03' },
      ],
    }) });
  }
  const allowed = name === 'staffDataRead' || (name === 'verifySession' && body.action !== 'logout');
  return allowed ? route.continue() : route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Preview read-only restriction"}' });
});
try {
  await page.goto(`http://127.0.0.1:4175/EstimatorCustomers?customer=${encodeURIComponent(customer)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const row = page.locator('[role="button"]').filter({ hasText: 'Bridgewater Church' }).first();
  await row.getByText('Bridgewater Church', { exact: true }).click({ timeout: 90000 });
  const dialog = page.getByRole('dialog', { name: 'Customer statement' });
  await dialog.getByText('37d overdue', { exact: true }).waitFor({ timeout: 30000 });
  if (await dialog.getByText('70d overdue', { exact: true }).count()) throw new Error('Paid invoice displayed an overdue badge.');
  if (await dialog.locator('span').filter({ hasText: /approved\s*×7/ }).count() === 0) throw new Error('Approved funnel chip missing.');
  if (await dialog.locator('span').filter({ hasText: /draft\s*×2/ }).count() === 0) throw new Error('Draft funnel chip missing.');
  if (await dialog.getByText('No estimates.', { exact: true }).count() !== 1 || await dialog.getByText('No jobs.', { exact: true }).count() !== 1) throw new Error('Empty states missing.');
  await page.screenshot({ path: '.audit-work/cb-customer-ui-review.png', fullPage: true });
  console.log('PASS customer popup: funnel chips restored; overdue badge only for matching invoice with positive balance; empty states shown.');
} catch (error) {
  await page.screenshot({ path: '.audit-work/cb-customer-ui-review-error.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
}
