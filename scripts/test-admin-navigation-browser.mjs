// Isolated Chromium acceptance for the *real* AdminSettings JSX, navigation and search.
// Non-navigation dependencies are synthetic, no live Base44 credentials/data or outside requests.
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, symlink, readFile, readdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const appRoot = process.cwd();
const { chromium } = await import(process.env.ADMIN_PLAYWRIGHT_PATH ||
  '/tmp/fleet-browser-check/node_modules/playwright/index.mjs');
const scratch = await mkdtemp(path.join(tmpdir(), 'ccs-admin-nav-'));
let server, browser, passed = 0;

const syntheticPanels = [
  'FaceRecognition', 'EmailGroupsManager', 'GmailConnector', 'UserManagement',
  'ProjectTrash', 'OrderTrash', 'TimeClockAdmin', 'TimeClockReportsDashboard',
  'ActivityFeed', 'PTOManagement', 'BackupManager', 'OvertimeRulesManager',
  'SalesPipelineDefaultSort', 'ResourceAllocationView', 'CorebridgeApiSettings',
  'SmartsheetSyncSettings', 'SyncConflictReview', 'OpportunityBridgeReview',
  'TaskAssignmentRules', 'WipImporter', 'PermittingRepositoryAdmin',
  'PermittingCompletenessDashboard', 'PermittingRulesReview', 'PermittingTestSuite',
  'JurisdictionMonitoringSettings', 'AdminCalendarSettings', 'PasswordMigrationButton',
];
const sources = [
  '../components/admin/EmailGroupsManager', '../components/admin/GmailConnector',
  '../components/admin/UserManagement', '../components/admin/ProjectTrash',
  '../components/admin/OrderTrash',
  '../components/timeclock/FaceRecognition', '../components/timeclock/TimeClockAdmin',
  '../components/timeclock/TimeClockReportsDashboard',
  '../components/admin/ActivityFeed', '../components/admin/PTOManagement',
  '../components/admin/BackupManager', '../components/admin/OvertimeRulesManager',
  '@/components/admin/SalesPipelineDefaultSort',
  '@/components/workflow/ResourceAllocationView',
  '@/components/admin/CorebridgeApiSettings', '@/components/admin/SmartsheetSyncSettings',
  '@/components/admin/SyncConflictReview', '@/components/admin/OpportunityBridgeReview',
  '@/components/admin/TaskAssignmentRules', '@/components/admin/WipImporter',
  '@/components/permitting/PermittingRepositoryAdmin.jsx',
  '@/components/permitting/PermittingCompletenessDashboard.jsx',
  '@/components/admin/PermittingRulesReview',
  '@/components/permitting/PermittingTestSuite',
  '@/components/admin/JurisdictionMonitoringSettings',
  '@/components/admin/AdminCalendarSettings',
  '@/components/admin/PasswordMigrationButton',
];

function monitor(page, origin, errors) {
  page.on('pageerror', e => errors.push('Browser: ' + e.message));
  page.on('request', request => {
    if (request.url().startsWith('http') && !request.url().startsWith(origin)) {
      errors.push('External request: ' + request.url());
    }
  });
  page.route('**/*', route => {
    const url = route.request().url();
    return url.startsWith('http') && !url.startsWith(origin)
      ? route.abort('blockedbyclient') : route.continue();
  });
}

async function check(name, width, urlSuffix, fn) {
  const context = await browser.newContext({ viewport: { width, height: 860 } });
  const errors = [];
  try {
    const page = await context.newPage();
    monitor(page, origin, errors);
    await page.goto(origin + urlSuffix, { waitUntil: 'networkidle' });
    await page.getByRole('search', { name: 'Search Admin pages and settings' }).waitFor();
    await fn(page);
    assert.deepEqual(errors, [], 'No browser errors or external requests');
    console.log('PASS ' + name);
    passed += 1;
  } finally {
    await context.close();
  }
}

let origin;
try {
  await symlink(path.join(appRoot, 'node_modules'), path.join(scratch, 'node_modules'), 'dir');
  const css = (await readdir(path.join(appRoot, 'dist/assets'))).find(name => name.endsWith('.css'));
  assert.ok(css, 'Build the app first to provide actual Tailwind CSS');
  await copyFile(path.join(appRoot, 'dist/assets', css), path.join(scratch, 'styles.css'));
  await writeFile(path.join(scratch, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div>' +
    '<script type="module" src="/main.jsx"></script></body></html>');
  await writeFile(path.join(scratch, 'main.jsx'), [
    'import React from "react";',
    'import { createRoot } from "react-dom/client";',
    'import { BrowserRouter } from "react-router-dom";',
    'import AdminSettings from "/@fs' + path.join(appRoot, 'src/pages/AdminSettings.jsx') + '";',
    'createRoot(document.getElementById("root")).render(<BrowserRouter><AdminSettings /></BrowserRouter>);',
  ].join('\n'));
  await writeFile(path.join(scratch, 'mockData.js'), [
    'export const base44={entities:{AutomationRule:{},EmailGroup:{},AuthorizedEmail:{}},functions:{invoke(){throw Error("Unexpected live API call")}}};',
  ].join('\n'));
  await writeFile(path.join(scratch, 'mockAuth.js'), [
    'export function useAuth(){const params=new URLSearchParams(window.location.search);return {currentUser:{id:params.get("user")||"synthetic-admin-user",role:params.get("role")==="basic"?"user":"admin"},sessionToken:"synthetic"};}',
    'export function getStoredAdminSettingsCapability(){return "synthetic";}',
    'export function hasStoredAdminSettingsAuthorization(){return true;}',
    'export function storeAdminSettingsAuthorization(){throw Error("Unexpected write to synthetic auth");}',
  ].join('\n'));
  await writeFile(path.join(scratch, 'mockPersistence.js'), [
    'export async function createAutomationRuleIfAbsent(){throw Error("Unexpected write");}',
    'export async function deleteAutomationRuleIfUnchanged(){throw Error("Unexpected write");}',
    'export async function updateAutomationRuleIfUnchanged(){throw Error("Unexpected write");}',
  ].join('\n'));
  await writeFile(path.join(scratch, 'mockLogin.js'), 'export async function verifyLogin(){throw Error("Unexpected login");}');
  await writeFile(path.join(scratch, 'mockEntityList.js'),
    'export async function loadAllEntityRows(){return [];}');
  for (const name of syntheticPanels) {
    await writeFile(path.join(scratch, 'mock-' + name + '.jsx'),
      'import React from "react";export default function ' + name +
      '(){return <div data-testid="synthetic-' + name + '">Synthetic ' + name + '</div>;}');
  }
  const aliases = [
    {find:'@/api/base44Client',replacement:path.join(scratch,'mockData.js')},
    {find:'@/components/auth/EmailGate',replacement:path.join(scratch,'mockAuth.js')},
    {find:'@/functions/verifyLogin',replacement:path.join(scratch,'mockLogin.js')},
    {find:'@/components/admin/automationRulePersistence',replacement:path.join(scratch,'mockPersistence.js')},
    {find:'@/components/estimator/loadAllEntityRows',replacement:path.join(scratch,'mockEntityList.js')},
    ...sources.map((find) => ({
      find,
      replacement:path.join(scratch,'mock-'+path.basename(find).replace(/\.jsx$/, '')+'.jsx'),
    })),
    {find:/^@\//,replacement:path.join(appRoot,'src')+'/'},
  ];
  server = await createServer({
    configFile:false, root:scratch, plugins:[react()],
    resolve:{alias:aliases},
    server:{host:'127.0.0.1',port:0,fs:{allow:[appRoot,scratch]}},
    logLevel:'error',
  });
  await server.listen();
  origin='http://127.0.0.1:'+server.httpServer.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});

  await check('Desktop group switching and selected-panel behavior', 1440, '/', async page=>{
    await page.getByRole('group',{name:'Admin navigation categories'}).getByRole('button',{name:'Integrations'}).click();
    assert.equal(new URL(page.url()).searchParams.get('tab'),'smartsheet');
    await page.getByTestId('synthetic-SmartsheetSyncSettings').waitFor();
    await page.getByRole('tab',{name:'CoreBridge Migration'}).click();
    await page.getByTestId('synthetic-CorebridgeApiSettings').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('tab'),'corebridge');
    assert.equal(await page.getByRole('group',{name:'Admin navigation categories'}).getByRole('button',{name:'Integrations'}).getAttribute('aria-pressed'),'true');
  });

  await check('Deep links to nested Time Clock and Backend settings', 1366,
    '/?tab=timeclock&subtab=pto', async page=>{
      await page.getByTestId('synthetic-PTOManagement').waitFor();
      await page.getByRole('tab',{name:'Overtime Rules'}).click();
      await page.getByTestId('synthetic-OvertimeRulesManager').waitFor();
      assert.equal(new URL(page.url()).searchParams.get('subtab'),'overtime');
      await page.getByRole('combobox',{name:'Find an Admin page or setting'}).fill('Data Backup');
      await page.getByRole('option',{name:/Data Backup/}).first().click();
      await page.getByTestId('synthetic-BackupManager').waitFor();
      assert.equal(new URL(page.url()).searchParams.get('tab'),'backend');
      assert.equal(new URL(page.url()).searchParams.get('subtab'),'backup');
    });

  await check('Keyboard Enter opens first result and Escape clears query', 1440, '/', async page=>{
    const box=page.getByRole('combobox',{name:'Find an Admin page or setting'});
    await box.fill('PTO');
    await box.press('Enter');
    await page.getByTestId('synthetic-PTOManagement').waitFor();
    assert.equal(await box.inputValue(),'');
    await box.fill('Smartsheet');
    await box.press('Escape');
    assert.equal(await box.inputValue(),'');
    assert.equal(await page.getByRole('button',{name:'Clear Admin search'}).count(),0);
  });

  await check('Browser Back/Forward restores selected category and panel', 1440, '/', async page=>{
    await page.getByRole('group',{name:'Admin navigation categories'}).getByRole('button',{name:'People'}).click();
    await page.getByTestId('synthetic-UserManagement').waitFor();
    await page.getByRole('group',{name:'Admin navigation categories'}).getByRole('button',{name:'Permitting'}).click();
    await page.getByTestId('synthetic-PermittingCompletenessDashboard').waitFor();
    await page.goBack();
    await page.getByTestId('synthetic-UserManagement').waitFor();
    await page.goForward();
    await page.getByTestId('synthetic-PermittingCompletenessDashboard').waitFor();
  });

  for (const width of [320,375,768,1440]) {
    await check('No Admin nav overflow at '+width+'px', width, '/?tab=smartsheet', async page=>{
      const bounds=await page.evaluate(()=>{
        const shell=document.querySelector('[aria-label="Admin navigation categories"]').parentElement;
        const root=document.documentElement;
        const viewport=innerWidth;
        const card=shell.getBoundingClientRect();
        const descendants=[...shell.querySelectorAll('button,[role="tab"],input,[role="tablist"]')];
        return {
          viewport,
          documentWidth:root.scrollWidth,
          cardLeft:card.left,
          cardRight:card.right,
          bad:descendants.filter(node=>{
            const box=node.getBoundingClientRect();
            return box.width>0 && (box.left < card.left-2 || box.right > card.right+2);
          }).map(node=>({text:node.textContent?.trim().slice(0,40),rect:node.getBoundingClientRect().toJSON()})),
        };
      });
      assert.ok(bounds.cardLeft>=-1 && bounds.cardRight<=width+1,JSON.stringify(bounds));
      assert.deepEqual(bounds.bad,[],JSON.stringify(bounds));
      assert.ok(bounds.documentWidth<=width+1,'Document horizontal overflow: '+JSON.stringify(bounds));
      await page.getByRole('combobox',{name:'Find an Admin page or setting'}).fill('permitting');
      const results=page.getByRole('option',{name:/Permitting/});
      await results.first().waitFor();
      const resultBounds=await page.evaluate(()=>{
        const card=document.querySelector('[aria-label="Admin navigation categories"]').parentElement.getBoundingClientRect();
        return [...document.querySelectorAll('[aria-label="Admin search results"] button')].filter(node=>{
          const rect=node.getBoundingClientRect();
          return rect.left<card.left-2 || rect.right>card.right+2;
        }).map(node=>node.textContent);
      });
      assert.deepEqual(resultBounds,[],'Search results remain inside card');
    });
  }

  await check('Non-admin excludes restricted sections from search and category bar', 375,
    '/?role=basic&tab=smartsheet', async page=>{
      assert.equal(await page.getByRole('group',{name:'Admin navigation categories'}).getByRole('button',{name:'Integrations'}).count(),0);
      await page.getByRole('combobox',{name:'Find an Admin page or setting'}).fill('Smartsheet');
      await page.getByText('No matching Admin settings. Try another term.').waitFor();
      assert.equal(await page.getByRole('tab',{name:'Smartsheet Sync'}).count(),0);
    });

  await check('Keyboard arrows move category focus without changing the selected page', 375, '/', async page => {
    const categories = page.getByRole('group', { name: 'Admin navigation categories' });
    const workflow = categories.getByRole('button', { name: 'Workflow' });
    const people = categories.getByRole('button', { name: 'People' });
    const system = categories.getByRole('button', { name: 'System' });
    await workflow.focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await system.evaluate(node => document.activeElement === node), true, 'Left wraps to last category');
    assert.equal(await workflow.getAttribute('aria-pressed'), 'true', 'Arrow keys must not activate a new category');
    await page.keyboard.press('Home');
    assert.equal(await workflow.evaluate(node => document.activeElement === node), true, 'Home returns to first');
    await page.keyboard.press('ArrowRight');
    assert.equal(await people.evaluate(node => document.activeElement === node), true, 'Right focuses next');
    assert.equal(await people.getAttribute('aria-pressed'), 'false');
    const outline = await people.evaluate(node => getComputedStyle(node).boxShadow);
    assert.notEqual(outline, 'none', 'Keyboard focus must be visually distinguishable');
    await page.keyboard.press('Enter');
    await page.getByTestId('synthetic-UserManagement').waitFor();
    assert.equal(await people.getAttribute('aria-pressed'), 'true', 'Enter activates category');
    assert.equal(await people.evaluate(node => document.activeElement === node), true, 'Focus remains on activating category');
  });

  await check('Non-admin category keyboard wraps only through accessible buttons', 375, '/?role=basic', async page => {
    const categories = page.getByRole('group', { name: 'Admin navigation categories' });
    const workflow = categories.getByRole('button', { name: 'Workflow' });
    const people = categories.getByRole('button', { name: 'People' });
    assert.equal(await categories.locator('button').count(), 2);
    await people.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await workflow.evaluate(node => document.activeElement === node), true);
    await page.keyboard.press('End');
    assert.equal(await people.evaluate(node => document.activeElement === node), true);
    await page.keyboard.press(' ');
    await page.getByTestId('synthetic-UserManagement').waitFor();
  });

  await check('Clicking a search result retains focus on the search control', 375, '/', async page => {
    const input = page.getByRole('combobox', { name: 'Find an Admin page or setting' });
    await input.fill('PTO');
    await page.getByRole('option', { name: /PTO Policies/ }).click();
    await page.getByTestId('synthetic-PTOManagement').waitFor();
    assert.equal(await input.evaluate(node => document.activeElement === node), true, 'Search input receives focus after clicked result disappears');
    assert.equal(await input.inputValue(), '');
  });

  await check('Search arrows highlight and Enter opens the selected result without losing input focus', 375, '/', async page => {
    const input = page.getByRole('combobox', { name: 'Find an Admin page or setting' });
    await input.fill('time');
    const rows = page.locator('[aria-label="Admin search results"] button');
    assert.ok(await rows.count() > 1, 'Fixture needs several matching settings');
    await input.press('ArrowDown');
    assert.equal(await rows.nth(0).getAttribute('data-admin-search-active'), 'true');
    await input.press('ArrowDown');
    assert.equal(await rows.nth(1).getAttribute('data-admin-search-active'), 'true');
    assert.equal(await input.evaluate(node => document.activeElement === node), true);
    assert.match(await page.getByRole('status').first().innerText(), /Selected .*2 of/);
    const expected = (await import('../src/components/admin/adminTabNavigation.js')).searchAdminSettings('time', true)[1];
    await input.press('Enter');
    assert.equal(await input.inputValue(), '');
    assert.equal(await input.evaluate(node => document.activeElement === node), true);
    assert.equal(new URL(page.url()).searchParams.get('tab'), expected.tab);
    assert.equal(new URL(page.url()).searchParams.get('subtab'), expected.subtab || null);
  });

  await check('Search reverse arrows wrap; editing and Escape reset the highlighted result', 320, '/', async page => {
    const input = page.getByRole('combobox', { name: 'Find an Admin page or setting' });
    await input.fill('time');
    const rows = page.locator('[aria-label="Admin search results"] button');
    const count = await rows.count();
    assert.ok(count > 1);
    await input.press('ArrowUp');
    assert.equal(await rows.nth(count - 1).getAttribute('data-admin-search-active'), 'true');
    const visible = await page.evaluate(() => {
      const item = document.querySelector('[data-admin-search-active="true"]')?.getBoundingClientRect();
      const list = document.querySelector('[aria-label="Admin search results"] .overflow-y-auto')?.getBoundingClientRect();
      return Boolean(item && list && item.top >= list.top - 2 && item.bottom <= list.bottom + 2);
    });
    assert.equal(visible, true, 'Keyboard selection scrolls into visible results');
    await input.press('ArrowDown');
    assert.equal(await rows.nth(0).getAttribute('data-admin-search-active'), 'true');
    await input.fill('timecl');
    assert.equal(await page.locator('[data-admin-search-active="true"]').count(), 0);
    await input.fill('time');
    await input.press('ArrowDown');
    await input.press('Escape');
    assert.equal(await input.inputValue(), '');
    await input.fill('nonexistent-admin-category-123');
    await input.press('ArrowDown');
    assert.equal(await page.locator('[data-admin-search-active="true"]').count(), 0);
    await input.press('Enter');
    assert.equal(new URL(page.url()).searchParams.has('tab'), false);
  });

  await check('Screen reader combobox points to the highlighted option and retains input focus', 375, '/', async page => {
    const input = page.getByRole('combobox', { name: 'Find an Admin page or setting' });
    assert.equal(await input.getAttribute('aria-expanded'), 'false');
    assert.equal(await input.getAttribute('aria-activedescendant'), null);
    await input.fill('time');
    const listbox = page.getByRole('listbox', { name: 'Matching Admin settings' });
    const options = listbox.getByRole('option');
    assert.ok(await options.count() > 1);
    assert.equal(await input.getAttribute('aria-expanded'), 'true');
    assert.equal(await input.getAttribute('aria-controls'), await listbox.getAttribute('id'));
    assert.equal(await input.getAttribute('aria-activedescendant'), null);
    await input.press('ArrowDown');
    const firstOptionId = await options.nth(0).getAttribute('id');
    assert.equal(await input.getAttribute('aria-activedescendant'), firstOptionId);
    assert.equal(await options.nth(0).getAttribute('aria-selected'), 'true');
    assert.equal(await options.nth(1).getAttribute('aria-selected'), 'false');
    assert.equal(await input.evaluate(node => document.activeElement === node), true);
    await input.press('ArrowDown');
    assert.equal(await input.getAttribute('aria-activedescendant'), await options.nth(1).getAttribute('id'));
    assert.equal(await options.nth(0).getAttribute('aria-selected'), 'false');
    assert.equal(await options.nth(1).getAttribute('aria-selected'), 'true');
    await input.press('Enter');
    assert.equal(await input.getAttribute('aria-expanded'), 'false');
    assert.equal(await input.getAttribute('aria-controls'), null);
    assert.equal(await input.getAttribute('aria-activedescendant'), null);
  });

  await check('Screen reader search attributes reset after no matches or Escape', 320, '/', async page => {
    const input = page.getByRole('combobox', { name: 'Find an Admin page or setting' });
    await input.fill('time');
    await input.press('ArrowUp');
    assert.ok(await input.getAttribute('aria-activedescendant'));
    await input.fill('not-a-real-admin-setting-9999');
    assert.equal(await input.getAttribute('aria-expanded'), 'false');
    assert.equal(await input.getAttribute('aria-controls'), null);
    assert.equal(await input.getAttribute('aria-activedescendant'), null);
    assert.equal(await page.getByRole('listbox').count(), 0);
    await input.fill('pto');
    const listbox = page.getByRole('listbox');
    assert.equal(await input.getAttribute('aria-expanded'), 'true');
    assert.equal(await input.getAttribute('aria-controls'), await listbox.getAttribute('id'));
    await input.press('Escape');
    assert.equal(await input.getAttribute('aria-expanded'), 'false');
    assert.equal(await input.getAttribute('aria-controls'), null);
    assert.equal(await input.getAttribute('aria-activedescendant'), null);
    assert.equal(await input.evaluate(node => document.activeElement === node), true);
  });

  await check('Returning to Admin restores the most recent nested tab and direct links win', 375, '/?user=persistence-a', async page => {
    const search = page.getByRole('combobox', { name: 'Find an Admin page or setting' });
    await search.fill('PTO');
    await search.press('Enter');
    await page.getByTestId('synthetic-PTOManagement').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('subtab'), 'pto');

    await page.goto(origin+'/?user=persistence-a', { waitUntil: 'networkidle' });
    await page.getByTestId('synthetic-PTOManagement').waitFor();
    assert.equal(new URL(page.url()).searchParams.has('tab'), false, 'Restoration need not rewrite a direct URL');
    assert.equal(await page.getByRole('tab', { name: 'PTO Policies' }).getAttribute('data-state'), 'active');
    assert.equal(await page.getByRole('group', { name: 'Admin navigation categories' }).getByRole('button', { name: 'People' }).getAttribute('aria-pressed'), 'true');

    await page.goto(origin+'/?user=persistence-a&tab=backend&subtab=monitoring', { waitUntil: 'networkidle' });
    await page.getByTestId('synthetic-JurisdictionMonitoringSettings').waitFor();
    await page.goto(origin+'/?user=persistence-a', { waitUntil: 'networkidle' });
    await page.getByTestId('synthetic-JurisdictionMonitoringSettings').waitFor();

    await page.goto(origin+'/?user=persistence-a&tab=users', { waitUntil: 'networkidle' });
    await page.getByTestId('synthetic-UserManagement').waitFor();
    assert.equal(await page.getByTestId('synthetic-JurisdictionMonitoringSettings').count(), 0);
    await page.goto(origin+'/?user=persistence-a', { waitUntil: 'networkidle' });
    await page.getByTestId('synthetic-UserManagement').waitFor();
  });

  await check('Saved Admin navigation never crosses user identities', 375, '/?user=persistence-isolation-a&tab=smartsheet', async page => {
    await page.getByTestId('synthetic-SmartsheetSyncSettings').waitFor();
    await page.goto(origin+'/?user=persistence-isolation-b', { waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('group', { name: 'Admin navigation categories' }).getByRole('button', { name: 'Workflow' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByTestId('synthetic-SmartsheetSyncSettings').count(), 0);
    await page.goto(origin+'/?user=persistence-isolation-a', { waitUntil: 'networkidle' });
    await page.getByTestId('synthetic-SmartsheetSyncSettings').waitFor();
  });

  await check('Role downgrade hides and clears previously saved restricted destinations', 375, '/?user=persistence-downgrade&tab=backend&subtab=monitoring', async page => {
    await page.getByTestId('synthetic-JurisdictionMonitoringSettings').waitFor();
    await page.goto(origin+'/?user=persistence-downgrade&role=basic', { waitUntil: 'networkidle' });
    await page.getByRole('search', { name: 'Search Admin pages and settings' }).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'Backend Functions' }).count(), 0);
    assert.equal(await page.getByRole('group', { name: 'Admin navigation categories' }).getByRole('button', { name: 'System' }).count(), 0);
    assert.equal(await page.getByTestId('synthetic-JurisdictionMonitoringSettings').count(), 0);

    await page.goto(origin+'/?user=persistence-downgrade&role=basic&tab=backend&subtab=monitoring', { waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('tab', { name: 'Backend Functions' }).count(), 0);
    assert.equal(await page.getByTestId('synthetic-JurisdictionMonitoringSettings').count(), 0);
    await page.goto(origin+'/?user=persistence-downgrade', { waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('group', { name: 'Admin navigation categories' }).getByRole('button', { name: 'Workflow' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByTestId('synthetic-JurisdictionMonitoringSettings').count(), 0);
  });

  console.log('Admin real-page synthetic Chromium acceptance: '+passed+'/'+passed+' PASS');
} finally {
  if(browser) await browser.close();
  if(server) await server.close();
  await rm(scratch,{recursive:true,force:true});
}
