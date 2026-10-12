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
  'FaceRecognition', 'GmailConnector',
  'ProjectTrash', 'OrderTrash', 'TimeClockAdmin', 'TimeClockReportsDashboard',
  'ActivityFeed', 'PTOManagement', 'BackupManager', 'OvertimeRulesManager',
  'SalesPipelineDefaultSort', 'ResourceAllocationView', 'CorebridgeApiSettings',
  'SmartsheetSyncSettings', 'SyncConflictReview', 'OpportunityBridgeReview',
  'TaskAssignmentRules', 'WipImporter', 'PermittingRepositoryAdmin',
  'PermittingCompletenessDashboard', 'PermittingRulesReview', 'PermittingTestSuite',
  'JurisdictionMonitoringSettings', 'AdminCalendarSettings', 'PasswordMigrationButton',
];
const sources = [
  '../components/admin/GmailConnector',
  '../components/admin/ProjectTrash',
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

async function check(name, width, urlSuffix, fn, { allowSyntheticPanelError = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 860 } });
  const errors = [];
  try {
    const page = await context.newPage();
    monitor(page, origin, errors);
    await page.goto(origin + urlSuffix, { waitUntil: 'networkidle' });
    await page.getByRole('search', { name: 'Search Admin pages and settings' }).waitFor();
    await fn(page);
    // Chromium can report intentionally thrown render errors even after React
    // catches them in the panel boundary. Never allow unexpected exceptions.
    const unexpectedErrors = allowSyntheticPanelError
      ? errors.filter(error => error !== 'Browser: synthetic-private-panel-error')
      : errors;
    assert.deepEqual(unexpectedErrors, [], 'No unexpected browser errors or external requests');
    if (allowSyntheticPanelError) {
      assert.ok(errors.includes('Browser: synthetic-private-panel-error'),
        'Fixture exercised the real render error path');
    }
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
  await writeFile(path.join(scratch, 'mockEmailGroupPersistence.js'), [
    'export async function createEmailGroupIfAbsent(){throw Error("Unexpected email group write");}',
    'export async function updateEmailGroupIfUnchanged(){throw Error("Unexpected email group write");}',
    'export async function deleteEmailGroupIfUnused(){throw Error("Unexpected email group write");}',
  ].join('\n'));
  await writeFile(path.join(scratch, 'mockLogin.js'), 'export async function verifyLogin(){throw Error("Unexpected login");}');
  await writeFile(path.join(scratch, 'mockEntityList.js'),
    'export async function loadAllEntityRows({label}={}){const q=new URLSearchParams(location.search);if(label==="Admin Settings automation rules"){window.__adminAutomationReadAttempts=(window.__adminAutomationReadAttempts||0)+1;if(window.__adminAutomationFailure===true||(window.__adminAutomationFailure!==false&&q.get("automation_read_fail")==="1"))throw Error("synthetic-private-automation-read-error");return q.get("automation_rows")==="1"?[{id:"synthetic-rule-1",name:"Synthetic rule",enabled:true,triggers:[],actions:[]}]:[];}if(label==="Email Groups admin catalog"){window.__adminEmailManagerAttempts=(window.__adminEmailManagerAttempts||0)+1;if(window.__adminEmailManagerFailure===true||(window.__adminEmailManagerFailure!==false&&q.get("email_manager_fail")==="1"))throw Error("synthetic-private-email-manager-read-error");return q.get("email_group_rows")==="1"?[{id:"synthetic-group-1",name:"Synthetic Email Group",description:"Synthetic only",emails:["test@example.invalid"]}]:[];}if(label==="Admin Settings email groups"){window.__adminEmailChoicesAttempts=(window.__adminEmailChoicesAttempts||0)+1;if(window.__adminEmailChoicesFailure===true||(window.__adminEmailChoicesFailure!==false&&q.get("email_parent_fail")==="1"))throw Error("synthetic-private-email-choices-read-error");return q.get("email_group_rows")==="1"?[{id:"synthetic-group-1",name:"Synthetic Email Group",emails:["test@example.invalid"]}]:[];}return [];}');
  for (const name of syntheticPanels) {
    await writeFile(path.join(scratch, 'mock-' + name + '.jsx'),
      'import React from "react";export default function ' + name +
      '(){if(window.__adminPanelFailures?.includes("'+name+'"))throw new Error("synthetic-private-panel-error");return <div data-testid="synthetic-' + name + '">Synthetic ' + name + '</div>;}');
  }
  await writeFile(path.join(scratch, 'mock-UserManagement.jsx'), [
    'import React from "react";',
    'import RealUserManagement from "/@fs' + path.join(appRoot, 'src/components/admin/UserManagement.jsx') + '";',
    'export default function UserManagement(){',
    'if(window.__adminPanelFailures?.includes("UserManagement"))throw Error("synthetic-private-panel-error");',
    'return new URLSearchParams(location.search).get("real_users")==="1"?<RealUserManagement />:',
    '<div data-testid="synthetic-UserManagement">Synthetic UserManagement</div>;',
    '}',
  ].join('\n'));
  for (const name of ['UserQRCode','FaceEnrollmentDialog','UserHRDataForm']) {
    await writeFile(path.join(scratch, 'mock-'+name+'.jsx'),
      'import React from "react";export default function '+name+'(){return <div data-testid="synthetic-'+name+'"/>;}');
  }
  await writeFile(path.join(scratch, 'mockAuthorizedUserPersistence.js'), [
    'import { validateDeletionImpactReport } from "/@fs' + path.join(appRoot, 'src/components/admin/deletionImpactValidation.js') + '";',
    'import { withDeletionImpactDeadline } from "/@fs' + path.join(appRoot, 'src/components/admin/deletionImpactDeadline.js') + '";',
    'const fail=()=>{throw Error("Unexpected synthetic user mutation");};',
    'export const createAuthorizedUserAdmin=fail, deleteAuthorizedUserAdmin=fail;',
    'export const updateAuthorizedUserAdmin=fail, updateAuthorizedUserHrAdmin=fail;',
    'export const resolveAccountDeletionRequestAdmin=fail;',
    'export async function getAccountDeletionImpactAdmin({request}={}){',
    ' window.__adminImpactAttempts=(window.__adminImpactAttempts||0)+1;',
    ' const params=new URLSearchParams(location.search);',
    ' return withDeletionImpactDeadline(async()=>{',
    ' if(window.__adminImpactFailure===true||(window.__adminImpactFailure!==false&&params.get("impact_fail")==="1"))',
    ' throw Error("secret-synthetic-impact-diagnostic");',
    ' const entities=list=>list.split(",").map(entity=>({entity,count:0}));',
    ' const report={read_only:true,request:{...request},target:{email:request.user_email,authorized_email_id:request.authorized_email_id,authorized_email_exists:true,base44_user_count:1,base44_user_ids:["synthetic-user"]},',
    ' assignments:{WorkOrder:2,GeneralTask:0,CalendarEvent:0},blockers:["Synthetic review verified"],',
    ' history:entities("TimeEntry,TimeClockAudit,TimeOffRequest,TimeClockBreak,TimeClockWorkPause,TimeClockCorrectionRequest,TimeClockLaborSegment,ImportJob"),',
    ' account_state:entities("TimeClockEmployeeState,TimeClockBadge,UserPTOBalance,UserCalendarSettings,UserCapacity,UserCredential,FleetDashboardPreference"),',
    ' ownership:entities("AllInOneEstimate,BuilderProduct,BuilderPart,BuilderPartGroup,QuickProduct,PartTemplate,ProjectTemplate,EstimateClipboardItem,CustomerSummary,FoundationProject,ChannelLetterInstallation,VinylProject,CNCProject,LaserProject,MetalProject,MaintenanceProject,Project,BrickStoneProject,Report,SaveColor")};',
    ' const invalid=window.__adminImpactInvalid??params.get("impact_invalid");',
    ' if(invalid==="request")report.request.id="other-request";',
    ' if(invalid==="version")report.request.updated_date="2025-01-01";',
    ' if(invalid==="target")report.target.email="other@example.invalid";',
    ' if(invalid==="counts")report.history[0].count=-1;',
    ' if(invalid==="partial")report.ownership.pop();',
    ' if(window.__adminImpactDelay===true)await new Promise(resolve=>{(window.__adminImpactPending??=[]).push({resolve,report});});',
    ' return validateDeletionImpactReport(report,request);',
    ' },params.get("impact_timeout")==="1"?110:75000);',
    '}',
    'export async function listAccountDeletionRequestsAdmin(){',
    ' window.__adminDeletionListAttempts=(window.__adminDeletionListAttempts||0)+1;',
    ' const params=new URLSearchParams(location.search);',
    ' if(window.__adminDeletionListFailure===true||(window.__adminDeletionListFailure!==false&&params.get("deletion_read_fail")==="1"))',
    ' throw Error("synthetic-private-deletion-request-error");',
    ' return params.get("deletion_rows")==="1"?',
    ' [{id:"synthetic-deletion-request",user_name:"Synthetic Review Request",user_email:"review@example.invalid",authorized_email_id:"synthetic-authorized-1",status:"pending",updated_date:"2026-01-01T00:00:00Z",requested_at:"2026-01-01T00:00:00Z"}]:[];',
    '}', 
    'export async function listAuthorizedUsersAdmin(){',
    ' window.__adminUserDirectoryAttempts=(window.__adminUserDirectoryAttempts||0)+1;',
    ' const params=new URLSearchParams(location.search);',
    ' if(window.__adminUserDirectoryFailure===true||(window.__adminUserDirectoryFailure!==false&&params.get("user_directory_fail")==="1"))',
    ' throw Error("synthetic-private-user-directory-error");',
    ' return params.get("user_rows")==="1"?',
    ' [{id:"synthetic-person-1",email:"staff@example.invalid",full_name:"Synthetic Directory User",role:"user",updated_date:"synthetic"}]:[];',
    '}',
  ].join('\n'));
  await writeFile(path.join(scratch, 'mockSetPassword.js'),
    'export async function setPassword(){throw Error("Unexpected password change");}');
  const aliases = [
    {find:'@/api/base44Client',replacement:path.join(scratch,'mockData.js')},
    {find:'@/components/auth/EmailGate',replacement:path.join(scratch,'mockAuth.js')},
    {find:'@/functions/verifyLogin',replacement:path.join(scratch,'mockLogin.js')},
    {find:'@/components/admin/automationRulePersistence',replacement:path.join(scratch,'mockPersistence.js')},
    {find:'@/components/admin/emailGroupPersistence',replacement:path.join(scratch,'mockEmailGroupPersistence.js')},
    {find:'../components/admin/UserManagement',replacement:path.join(scratch,'mock-UserManagement.jsx')},
    {find:'@/components/admin/authorizedUserAdminPersistence',replacement:path.join(scratch,'mockAuthorizedUserPersistence.js')},
    {find:'@/functions/setPassword',replacement:path.join(scratch,'mockSetPassword.js')},
    {find:'@/components/timeclock/UserQRCode',replacement:path.join(scratch,'mock-UserQRCode.jsx')},
    {find:'@/components/timeclock/FaceEnrollmentDialog',replacement:path.join(scratch,'mock-FaceEnrollmentDialog.jsx')},
    {find:'@/components/user/UserHRDataForm',replacement:path.join(scratch,'mock-UserHRDataForm.jsx')},
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

  await check('Nested Backend panel render failure is isolated, retryable and does not reveal exception', 375, '/?tab=backend&subtab=client_trash', async page => {
    await page.getByTestId('synthetic-ProjectTrash').waitFor();
    await page.evaluate(() => { window.__adminPanelFailures = ['BackupManager']; });
    await page.getByRole('tab', { name: 'Data Backup' }).click();
    const failure = page.getByRole('alert', { name: 'Data Backup panel failed' });
    await failure.waitFor();
    assert.match(await failure.innerText(), /couldn't load/);
    assert.equal((await failure.innerText()).includes('synthetic-private-panel-error'), false,
      'No raw error details or credentials appear in the fallback');
    assert.equal(await page.getByRole('group', { name: 'Admin navigation categories' }).isVisible(), true);
    await failure.getByRole('button', { name: 'Retry panel' }).click();
    await failure.waitFor();
    assert.equal(await failure.getByRole('button', { name: 'Retry panel' }).count(), 1,
      'A repeat failure still gives a recoverable fallback');
    await page.getByRole('tab', { name: 'Client Trash' }).click();
    await page.getByTestId('synthetic-ProjectTrash').waitFor();
    await page.getByRole('tab', { name: 'Data Backup' }).click();
    await failure.waitFor();
    await page.evaluate(() => { window.__adminPanelFailures = []; });
    await failure.getByRole('button', { name: 'Retry panel' }).click();
    await page.getByTestId('synthetic-BackupManager').waitFor();
    assert.equal(await failure.count(), 0);
  }, { allowSyntheticPanelError: true });

  await check('Failed Users panel does not block access to other main Admin categories', 320, '/?tab=calendar', async page => {
    await page.getByTestId('synthetic-AdminCalendarSettings').waitFor();
    await page.evaluate(() => { window.__adminPanelFailures = ['UserManagement']; });
    await page.getByRole('group', { name: 'Admin navigation categories' }).getByRole('button', { name: 'People' }).click();
    const failure = page.getByRole('alert', { name: 'Users panel failed' });
    await failure.waitFor();
    await page.getByRole('group', { name: 'Admin navigation categories' }).getByRole('button', { name: 'Integrations' }).click();
    await page.getByTestId('synthetic-SmartsheetSyncSettings').waitFor();
    assert.equal(await failure.count(), 0);
    await page.getByRole('group', { name: 'Admin navigation categories' }).getByRole('button', { name: 'People' }).click();
    await failure.waitFor();
    await page.evaluate(() => { window.__adminPanelFailures = []; });
    await failure.getByRole('button', { name: 'Retry panel' }).click();
    await page.getByTestId('synthetic-UserManagement').waitFor();
  }, { allowSyntheticPanelError: true });

  await check('Failed automation read shows retry, not an empty rule list or editable controls', 375,
    '/?tab=automations&automation_read_fail=1', async page => {
      const failure = page.getByRole('alert', { name: 'Automation rules unavailable' });
      await failure.waitFor();
      assert.match(await failure.innerText(), /could not be loaded/);
      assert.equal((await failure.innerText()).includes('synthetic-private-automation-read-error'), false);
      assert.equal(await page.getByText('No Automations').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Create First Automation' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'New Automation' }).isDisabled(), true);
      assert.equal(await page.getByText('Total Automations').count(), 0, 'Do not present unverified zero counts');
      const attemptCount = await page.evaluate(() => window.__adminAutomationReadAttempts);
      await failure.getByRole('button', { name: 'Retry loading rules' }).click();
      await failure.waitFor();
      assert.ok(await page.evaluate(() => window.__adminAutomationReadAttempts) > attemptCount);
      assert.equal(await page.getByText('No Automations').count(), 0);
      await page.getByRole('group', { name: 'Admin navigation categories' })
        .getByRole('button', { name: 'People' }).click();
      await page.getByTestId('synthetic-UserManagement').waitFor();
      await page.getByRole('group', { name: 'Admin navigation categories' })
        .getByRole('button', { name: 'Workflow' }).click();
      await failure.waitFor();
      await page.evaluate(() => { window.__adminAutomationFailure = false; });
      await failure.getByRole('button', { name: 'Retry loading rules' }).click();
      await page.getByText('No Automations').waitFor();
      assert.equal(await failure.count(), 0);
      assert.equal(await page.getByRole('button', { name: 'New Automation' }).isEnabled(), true);
    });

  await check('Successful automation retry distinguishes actual rules from a failed read', 768,
    '/?tab=automations&automation_rows=1&automation_read_fail=1', async page => {
      const failure = page.getByRole('alert', { name: 'Automation rules unavailable' });
      await failure.waitFor();
      assert.equal(await page.getByText('Synthetic rule').count(), 0);
      assert.equal(await page.getByText('No Automations').count(), 0);
      await page.evaluate(() => { window.__adminAutomationFailure = false; });
      await failure.getByRole('button', { name: 'Retry loading rules' }).click();
      await page.getByText('Synthetic rule').waitFor();
      assert.equal(await page.getByText('Total Automations').count(), 1);
      assert.equal(await failure.count(), 0);
      assert.equal(await page.getByRole('button', { name: 'New Automation' }).isEnabled(), true);
    });

  await check('Email Groups read failure blocks edits, explains error and recovers only after verified retry',
    375, '/?tab=automations&email_manager_fail=1&email_group_rows=1', async page => {
      const unavailable = page.getByRole('alert', { name: 'Email groups unavailable' });
      await unavailable.waitFor();
      assert.equal(await page.getByText('No email groups yet').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'New Group' }).isDisabled(), true);
      assert.equal(await page.getByText('Synthetic Email Group').count(), 0);
      assert.ok(!(await unavailable.innerText()).includes('synthetic-private-email-manager-read-error'));
      const before = await page.evaluate(() => window.__adminEmailManagerAttempts);
      await unavailable.getByRole('button', { name: 'Retry loading groups' }).click();
      await unavailable.waitFor();
      assert.ok(await page.evaluate(() => window.__adminEmailManagerAttempts) > before);
      await page.evaluate(() => { window.__adminEmailManagerFailure = false; });
      await unavailable.getByRole('button', { name: 'Retry loading groups' }).click();
      await page.getByText('Synthetic Email Group').waitFor();
      assert.equal(await unavailable.count(), 0);
      assert.equal(await page.getByRole('button', { name: 'New Group' }).isEnabled(), true);
      assert.equal(await page.getByRole('group', { name: 'Admin navigation categories' }).isVisible(), true);
    });

  await check('Automations group choices fail independently and retry without enabling unverified editing',
    375, '/?tab=automations&email_parent_fail=1&automation_rows=1', async page => {
      const unavailable = page.getByRole('alert', { name: 'Automation email groups unavailable' });
      await unavailable.waitFor();
      assert.equal(await page.getByRole('button', { name: 'New Automation' }).isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: 'New Group' }).isEnabled(), true,
        'Independent Email Groups manager remains operable');
      const before = await page.evaluate(() => window.__adminEmailChoicesAttempts);
      await unavailable.getByRole('button', { name: 'Retry group choices' }).click();
      await unavailable.waitFor();
      assert.ok(await page.evaluate(() => window.__adminEmailChoicesAttempts) > before);
      await page.evaluate(() => { window.__adminEmailChoicesFailure = false; });
      await unavailable.getByRole('button', { name: 'Retry group choices' }).click();
      await unavailable.waitFor({ state: 'detached' });
      assert.equal(await page.getByRole('button', { name: 'New Automation' }).isEnabled(), true);
      await page.getByRole('button', { name: 'New Automation' }).click();
      const editor = page.getByRole('dialog', { name: /Create Automation/ });
      await editor.waitFor();
      await editor.getByRole('button', { name: 'Cancel' }).click();
      assert.equal(await page.getByRole('button', { name: 'New Group' }).isEnabled(), true);
    });

  await check('User directory read failure is explicit and cannot authorize account changes', 375,
    '/?tab=users&real_users=1&user_rows=1&user_directory_fail=1', async page => {
      const error = page.getByRole('alert', { name: 'User directory unavailable' });
      await error.waitFor();
      assert.match(await error.innerText(), /Team directory could not be loaded/);
      assert.equal((await error.innerText()).includes('synthetic-private-user-directory-error'), false);
      assert.equal(await page.getByText('User count unavailable').count(), 1);
      assert.equal(await page.getByText('No users yet. Invite your first team member above.').count(), 0);
      assert.equal(await page.getByText('Synthetic Directory User').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Add User' }).isDisabled(), true);
      assert.equal(await page.getByRole('heading', { name: 'Account Deletion Requests' }).isVisible(), true);
      const attempts = await page.evaluate(() => window.__adminUserDirectoryAttempts);
      await error.getByRole('button', { name: 'Retry loading users' }).click();
      await error.waitFor();
      assert.ok(await page.evaluate(() => window.__adminUserDirectoryAttempts) > attempts);
      await page.evaluate(() => { window.__adminUserDirectoryFailure = false; });
      await error.getByRole('button', { name: 'Retry loading users' }).click();
      await page.getByText('Synthetic Directory User').waitFor();
      assert.equal(await error.count(), 0);
      assert.equal(await page.getByText('1 users in your organization').count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Add User' }).isEnabled(), true);
      assert.equal(await page.getByRole('search', { name: 'Search Admin pages and settings' }).isVisible(), true);
    });

  await check('User directory verified-empty state is distinct from an unsuccessful read', 320,
    '/?tab=users&real_users=1&user_directory_fail=1', async page => {
      const error = page.getByRole('alert', { name: 'User directory unavailable' });
      await error.waitFor();
      assert.equal(await page.getByText('No users yet. Invite your first team member above.').count(), 0);
      await page.evaluate(() => { window.__adminUserDirectoryFailure = false; });
      await error.getByRole('button', { name: 'Retry loading users' }).click();
      await page.getByText('No users yet. Invite your first team member above.').waitFor();
      assert.equal(await error.count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Add User' }).isEnabled(), true);
      await page.getByRole('group', { name: 'Admin navigation categories' }).getByRole('button', { name: 'Integrations' }).click();
      await page.getByTestId('synthetic-SmartsheetSyncSettings').waitFor();
    });

  await check('Failed deletion-request read never looks empty or enables review actions', 375,
    '/?tab=users&real_users=1&deletion_read_fail=1&deletion_rows=1', async page => {
      const error = page.getByRole('alert', { name: 'Account deletion requests unavailable' });
      await error.waitFor();
      assert.match(await error.innerText(), /could not be loaded/);
      assert.equal((await error.innerText()).includes('synthetic-private-deletion-request-error'), false);
      assert.equal(await page.getByText('Pending request count unavailable').count(), 1);
      assert.equal(await page.getByText('No account deletion requests have been submitted.').count(), 0);
      assert.equal(await page.getByText('Synthetic Review Request').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Mark Reviewed' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Review Impact' }).count(), 0);
      const attempts = await page.evaluate(() => window.__adminDeletionListAttempts);
      await error.getByRole('button', { name: 'Retry loading requests' }).click();
      await error.waitFor();
      assert.ok(await page.evaluate(() => window.__adminDeletionListAttempts) > attempts);
      assert.equal(await page.getByText('Synthetic Review Request').count(), 0);
      await page.evaluate(() => { window.__adminDeletionListFailure = false; });
      await error.getByRole('button', { name: 'Retry loading requests' }).click();
      await page.getByText('Synthetic Review Request').waitFor();
      assert.equal(await error.count(), 0);
      assert.equal(await page.getByText('1 pending review').count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Mark Reviewed' }).isEnabled(), true);
      await page.getByRole('button', { name: 'Mark Reviewed' }).click();
      const decision = page.getByRole('alertdialog', { name: /Mark deletion request reviewed/ });
      await decision.waitFor();
      await decision.getByRole('button', { name: 'Back' }).click();
      // Failed refreshing previously verified requests must hide stale decision actions.
      await page.evaluate(() => { window.__adminDeletionListFailure = true; });
      await page.getByRole('button', { name: 'Refresh' }).click();
      await error.waitFor();
      assert.equal(await page.getByRole('button', { name: 'Mark Reviewed' }).count(), 0);
      assert.equal(await page.getByText('Synthetic Review Request').count(), 0);
      assert.equal(await page.getByText('Pending request count unavailable').count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Add User' }).isEnabled(), true,
        'Unrelated verified user directory remains independently available');
    });

  await check('Verified-empty deletion requests display empty state only after successful retry', 320,
    '/?tab=users&real_users=1&deletion_read_fail=1', async page => {
      const error = page.getByRole('alert', { name: 'Account deletion requests unavailable' });
      await error.waitFor();
      assert.equal(await page.getByText('No account deletion requests have been submitted.').count(), 0);
      await page.evaluate(() => { window.__adminDeletionListFailure = false; });
      await error.getByRole('button', { name: 'Retry loading requests' }).click();
      await page.getByText('No account deletion requests have been submitted.').waitFor();
      assert.equal(await error.count(), 0);
      assert.equal(await page.getByText('0 pending review').count(), 1);
      await page.getByRole('group', { name: 'Admin navigation categories' })
        .getByRole('button', { name: 'Integrations' }).click();
      await page.getByTestId('synthetic-SmartsheetSyncSettings').waitFor();
    });

  await check('Failed impact scan displays safe error and manual retry restores read-only report', 375,
    '/?tab=users&real_users=1&deletion_rows=1&impact_fail=1', async page => {
      await page.getByRole('button', { name: 'Review Impact' }).click();
      const dialog = page.getByRole('dialog', { name: /Account Deletion Impact/ });
      await dialog.waitFor();
      const error = dialog.getByRole('alert', { name: 'Account deletion impact unavailable' });
      await error.waitFor();
      assert.match(await error.innerText(), /read-only impact scan could not be verified/);
      assert.equal((await error.innerText()).includes('secret-synthetic-impact-diagnostic'), false);
      assert.equal(await dialog.getByText('Synthetic review verified').count(), 0);
      assert.equal(await dialog.getByRole('button', { name: 'Close' }).first().isEnabled(), true);
      const before = await page.evaluate(() => window.__adminImpactAttempts);
      await error.getByRole('button', { name: 'Retry impact scan' }).click();
      await error.waitFor();
      assert.ok(await page.evaluate(() => window.__adminImpactAttempts) > before);
      await page.evaluate(() => { window.__adminImpactFailure = false; });
      await error.getByRole('button', { name: 'Retry impact scan' }).click();
      await dialog.getByText('Synthetic review verified').waitFor();
      assert.equal(await error.count(), 0);
      assert.equal(await dialog.getByText('Read-only review only.', { exact: false }).count(), 1);
      await dialog.getByRole('button', { name: 'Close' }).first().click();
      await dialog.waitFor({ state: 'detached' });
    });

  await check('Closing a pending impact scan discards its late result', 375,
    '/?tab=users&real_users=1&deletion_rows=1', async page => {
      await page.evaluate(() => { window.__adminImpactDelay = true; });
      await page.getByRole('button', { name: 'Review Impact' }).click();
      const dialog = page.getByRole('dialog', { name: /Account Deletion Impact/ });
      await dialog.waitFor();
      await dialog.getByRole('status').getByText('Reviewing account impact...').waitFor();
      assert.equal(await dialog.getByRole('button', { name: 'Close' }).first().isEnabled(), true);
      await dialog.getByRole('button', { name: 'Close' }).first().click();
      await dialog.waitFor({ state: 'detached' });
      await page.evaluate(() => {
        const pending = window.__adminImpactPending.shift();
        window.__adminImpactDelay = false;
        pending.resolve(pending.report);
      });
      await page.getByRole('button', { name: 'Review Impact' }).click();
      await dialog.getByText('Synthetic review verified').waitFor();
      assert.equal(await dialog.getByRole('alert', { name: 'Account deletion impact unavailable' }).count(), 0);
      await dialog.getByRole('button', { name: 'Close' }).first().click();
    });

  await check('Malformed and cross-account impact results are rejected until a verified retry', 375,
    '/?tab=users&real_users=1&deletion_rows=1&impact_invalid=request', async page => {
      await page.getByRole('button', { name: 'Review Impact' }).click();
      const dialog = page.getByRole('dialog', { name: /Account Deletion Impact/ });
      const error = dialog.getByRole('alert', { name: 'Account deletion impact unavailable' });
      await error.waitFor();
      assert.equal(await dialog.getByText('Synthetic review verified').count(), 0);
      assert.equal(await dialog.getByText('Workflow references').count(), 0);
      const first = await page.evaluate(() => window.__adminImpactAttempts);
      for (const category of ['version', 'target', 'counts', 'partial']) {
        await page.evaluate(value => { window.__adminImpactInvalid = value; }, category);
        await error.getByRole('button', { name: 'Retry impact scan' }).click();
        await error.waitFor();
        assert.equal(await dialog.getByText('Synthetic review verified').count(), 0);
        assert.equal(await dialog.getByText('Workflow references').count(), 0);
      }
      assert.ok(await page.evaluate(() => window.__adminImpactAttempts) >= first + 4);
      await page.evaluate(() => { window.__adminImpactInvalid = false; });
      await error.getByRole('button', { name: 'Retry impact scan' }).click();
      await dialog.getByText('Synthetic review verified').waitFor();
      assert.equal(await error.count(), 0);
      assert.equal(await dialog.getByText('Workflow references').count(), 1);
      await dialog.getByRole('button', { name: 'Close' }).first().click();
      await dialog.waitFor({ state: 'detached' });
    });

  await check('Read-only impact scan shows its scope without fabricated completion percentages', 375,
    '/?tab=users&real_users=1&deletion_rows=1', async page => {
      await page.evaluate(() => { window.__adminImpactDelay = true; });
      await page.getByRole('button', { name: 'Review Impact' }).click();
      const dialog = page.getByRole('dialog', { name: /Account Deletion Impact/ });
      const progress = dialog.getByRole('status', { name: 'Account impact scan in progress' });
      await progress.waitFor();
      const included = progress.getByRole('list', { name: 'Impact checks included' });
      assert.equal(await included.getByRole('listitem').count(), 5);
      for (const label of [
        'User identity and account match',
        'Payroll and timekeeping history',
        'Account state and credentials',
        'Estimator record ownership',
        'Work order, task and calendar references',
      ]) assert.equal(await included.getByText(label).count(), 1);
      assert.match(await progress.innerText(), /Individual completion percentages are unavailable/);
      assert.equal(await dialog.getByText('Synthetic review verified').count(), 0);
      assert.equal(await dialog.getByRole('button', { name: 'Close' }).first().isEnabled(), true);
      await dialog.getByRole('button', { name: 'Close' }).first().click();
      await dialog.waitFor({ state: 'detached' });
      await page.evaluate(() => {
        const pending = window.__adminImpactPending.shift();
        window.__adminImpactDelay = false;
        pending.resolve(pending.report);
      });
      assert.equal(await page.getByRole('dialog', { name: /Account Deletion Impact/ }).count(), 0);
    });

  console.log('Admin real-page synthetic Chromium acceptance: '+passed+'/'+passed+' PASS');
} finally {
  if(browser) await browser.close();
  if(server) await server.close();
  await rm(scratch,{recursive:true,force:true});
}
