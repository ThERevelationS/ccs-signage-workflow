import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Reuse the existing real-page, synthetic-only Admin fixture. It blocks every
// external request and mocks persistence; these tests never open the live app.
const root = process.cwd();
const sourceRoot = path.resolve(process.env.AUTOMATION_SOURCE_ROOT || root);
const harness = await readFile(path.join(root, "scripts/test-admin-navigation-browser.mjs"), "utf8");
const marker = "  await check('Desktop group switching";
assert.ok(harness.includes(marker), "Admin browser fixture bootstrap must remain available");
let bootstrap = harness.slice(0, harness.indexOf(marker));
bootstrap = bootstrap
  .replace("const syntheticPanels = [", "const syntheticPanels = ['FleetSettings','WorkflowSchedulesPanel',")
  .replace("const sources = [", "const sources = ['@/pages/FleetSettings','@/components/admin/WorkflowSchedulesPanel',")
  .replace("path.join(appRoot, 'src/pages/AdminSettings.jsx')", JSON.stringify(path.join(sourceRoot, "src/pages/AdminSettings.jsx")))
  .replace("const aliases = [", `await writeFile(path.join(scratch,'mockAuth.js'), '\\nexport function getSessionToken(){return "synthetic";}\\nexport function getSessionUser(){return {role:"admin"};}\\n', {flag:'a'});
  const aliases = [
    {find:'../components/admin/EmailGroupsManager',replacement:${JSON.stringify(path.join(root, "src/components/admin/EmailGroupsManager.jsx"))}},
    {find:'@/components/admin/automationBuilderModel.mjs',replacement:${JSON.stringify(path.join(sourceRoot, "src/components/admin/automationBuilderModel.mjs"))}},`)
  .replace("fs:{allow:[appRoot,scratch]}", `fs:{allow:[appRoot,scratch,${JSON.stringify(sourceRoot)}]}`);

const checks = `
  for (const width of [1440, 390]) {
    await check('Automation starters, relevant filters and disabled save ('+width+'px)', width,
      '/?tab=automations', async page => {
        await page.getByRole('button',{name:'New Automation',exact:true}).click();
        const editor=page.getByRole('dialog',{name:'Create Automation',exact:true});
        await editor.getByRole('button',{name:'Email admins about a new bug report',exact:true}).click();
        assert.equal(await editor.getByLabel('Report type',{exact:true}).inputValue(),'bug');
        assert.equal(await editor.getByText('ASAP Only',{exact:true}).count(),0);
        await page.evaluate(()=>{window.__adminAutomationAllowSyntheticWrite=true;});
        await editor.getByRole('button',{name:'Create Automation',exact:true}).click();
        await editor.waitFor({state:'detached'});
        assert.equal(await page.evaluate(()=>window.__adminAutomationSavedSnapshot.enabled),false);
      });

    await check('Record task destinations and new-rule trigger choices ('+width+'px)', width,
      '/?tab=automations', async page => {
        await page.getByRole('button',{name:'New Automation',exact:true}).click();
        const editor=page.getByRole('dialog',{name:'Create Automation',exact:true});
        await editor.getByRole('button',{name:'Email admins about a new bug report',exact:true}).click();
        await editor.getByRole('combobox').filter({hasText:'Send Email'}).click();
        assert.equal(await page.getByRole('option',{name:'Move to Stage',exact:true}).count(),0);
        await page.getByRole('option',{name:'Add Task',exact:true}).click();
        await editor.getByLabel('Task text',{exact:true}).fill('Investigate the report');
        assert.equal(await editor.getByRole('button',{name:'Create Automation',exact:true}).isDisabled(),true);
        await editor.getByLabel('Destination Work Order *',{exact:true}).fill('https://example.invalid/MainWorkflow?wo=synthetic-target');
        await editor.getByLabel('Destination Work Order *',{exact:true}).press('Tab');
        assert.equal(await editor.getByLabel('Destination Work Order *',{exact:true}).inputValue(),'synthetic-target');
        assert.equal(await editor.getByRole('button',{name:'Create Automation',exact:true}).isEnabled(),true);
        await editor.getByRole('combobox').filter({hasText:'Feature / Bug Report Submitted'}).click();
        const options=await page.getByRole('option').allTextContents();
        assert.ok(!options.some(text=>text.includes('not working yet')));
        await page.keyboard.press('Escape');
        assert.ok(await editor.getByText(/In plain terms:/).count());
        const bounds=await editor.boundingBox();
        assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width+1, 'Editor fits the viewport');
        if(process.env.AUTOMATION_SCREENSHOT_DIR)await page.screenshot({path:process.env.AUTOMATION_SCREENSHOT_DIR+'/automation-builder-'+width+'.png'});
      });
  }
  await check('Saved unavailable triggers stay visible without being offered for new rows', 390,
    '/?tab=automations', async page => {
      await page.addInitScript(()=>{
        window.__adminAutomationListOverrideRows=[{id:'legacy',updated_date:'v1',name:'Legacy import',enabled:false,
          triggers:[{trigger_type:'pending_import_approved',trigger_condition:{},logic:'or'}],
          actions:[{action_type:'send_email',action_config:{recipients:[{type:'all_admins'}]}}]}];
      });
      await page.reload({waitUntil:'networkidle'});
      await page.getByRole('button',{name:'Edit Legacy import',exact:true}).click();
      const editor=page.getByRole('dialog',{name:'Edit Automation',exact:true});
      await editor.getByText(/isn't connected to anything yet/).waitFor();
      await editor.getByRole('combobox').filter({hasText:'Pending Import Approved'}).click();
      assert.equal(await page.getByRole('option',{name:/Pending Import Approved/}).getAttribute('aria-disabled'),'true');
    });
  console.log('Automation builder desktop/mobile acceptance: '+passed+'/'+passed+' PASS');
} finally {
  if(browser) await browser.close();
  if(server) await server.close();
  await rm(scratch,{recursive:true,force:true});
}
`;

const work = await mkdtemp(path.join(tmpdir(), "ccs-automation-browser-"));
try {
  await symlink(path.join(root, "node_modules"), path.join(work, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(work, "runner.mjs"), bootstrap + checks);
  await import(pathToFileURL(path.join(work, "runner.mjs")));
} finally {
  await rm(work, { recursive: true, force: true });
}
