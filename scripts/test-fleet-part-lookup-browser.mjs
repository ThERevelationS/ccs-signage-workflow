// Isolated real-Chromium acceptance for the upgraded AI Part Finder dialog.
// All Base44 responses are synthetic in-memory fixtures; outside requests are blocked.
// Covers multi-candidate picking, inventory matches, linked requests, cross-ref
// re-search, vendor options, multi-photo, resume strip, barcode-Enter and fitment.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = process.cwd();
const playwrightPath = process.env.FLEET_PLAYWRIGHT_PATH || "/tmp/fleet-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(playwrightPath);
const scratch = await mkdtemp(path.join(tmpdir(), "fleet-part-lookup-browser-"));
let vite, browser, passed = 0;

try {
  await symlink(path.join(appRoot, "node_modules"), path.join(scratch, "node_modules"), "dir");
  await writeFile(path.join(scratch, "index.html"),
    "<!doctype html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head><body><div id='root'></div><script type='module' src='/main.jsx'></script></body></html>");
  await writeFile(path.join(scratch, "main.jsx"), [
    'import React from "react";',
    'import { createRoot } from "react-dom/client";',
    `import FleetPartLookupDialog from "/@fs/${appRoot.replace(/\\/g, "/")}/src/components/fleet/FleetPartLookupDialog.jsx";`,
    'const equipment = [',
    ' {id:"eq-1",name:"Synthetic Truck 7",type:"truck",year:"2019",make:"Isuzu",model:"NPR",status:"operational"},',
    ' {id:"eq-2",name:"Synthetic Excavator 3",type:"equipment",year:"2021",make:"Kubota",model:"KX040",status:"operational"},',
    ' {id:"eq-retired",name:"Retired Unit",type:"truck",year:"2004",make:"Ford",model:"F-350",status:"retired"},',
    '];',
    'const parts = [',
    ' {id:"part-stocked",part_name:"Synthetic stocked filter",part_number:"SYN-FLT-100",alternate_part_numbers:["XREF-9"],barcode_value:"",manufacturer:"WIX",category:"filters",quantity_on_hand:6,minimum_stock:2,storage_zone:"Parts room",storage_cabinet:"Rack A",storage_shelf:"Shelf 3",storage_bin:"B12",updated_date:"p1"},',
    ' {id:"part-dup",part_name:"Synthetic duplicate relay",part_number:"DUP-77",manufacturer:"Bosch",category:"electrical",quantity_on_hand:0,location:"Cabinet 2",updated_date:"p2"},',
    '];',
    'const identifications = [',
    ' {id:"ident-resume",creation_key:"ck-resume-0000000000",status:"needs_review",search_mode:"photo",query_text:"",uploaded_photo_urls:["https://files.example/resume.png"],candidate_part_name:"Resumed synthetic part",candidate_part_number:"RES-55",candidate_category:"electrical",candidate_manufacturer:"Delphi",confidence:"medium",reasoning:"Resume reasoning",verification_notes:"Resume verify",detected_text:"RES-55",suggested_equipment_ids:[],created_date:"2026-10-20T10:00:00Z"},',
    ' {id:"ident-done",status:"promoted",candidate_part_name:"Old promoted",created_date:"2026-10-19T10:00:00Z"},',
    '];',
    'createRoot(document.getElementById("root")).render(<FleetPartLookupDialog open={true} equipment={equipment} parts={parts} identifications={identifications} isAdmin={true} organizeMode={false} onClose={() => {}} onChanged={async () => {}} />);',
  ].join("\n"));

  await writeFile(path.join(scratch, "mockBase44.js"), [
    'const clone = v => JSON.parse(JSON.stringify(v));',
    'let revision = 1, uploadCount = 0;',
    'const state = {actions:[],llmCalls:[],requestRows:[],failNextAnalyze:false};',
    'window.__fleetPartLookupFixture = state;',
    'const aiResult = {',
    ' detected_text:"DUP-77 MADE IN GERMANY",',
    ' part_name:"Synthetic relay candidate A",part_number:"DUP-77",alternate_part_numbers:["XREF-9","ALT-555"],barcode_value:"",',
    ' category:"electrical",subcategory:"relay",manufacturer:"Bosch",description:"Synthetic 12V relay",specification:"40A 12V SPDT",',
    ' preferred_vendor:"SynthParts Co",vendor_sku:"SP-DUP77",vendor_url:"https://vendor.example/dup77",',
    ' source_urls:["https://docs.example/dup77-datasheet"],suggested_equipment_ids:["eq-1"],compatibility_notes:"Synthetic fit note",',
    ' confidence:"medium",reasoning:"Synthetic reasoning",verification_notes:"Verify pins",',
    ' field_confidence:{part_number:"high",manufacturer:"high",category:"medium",specification:"low",fitment:"medium"},',
    ' candidates:[',
    '  {part_name:"Synthetic relay candidate A",part_number:"DUP-77",alternate_part_numbers:["XREF-9","ALT-555"],category:"electrical",manufacturer:"Bosch",description:"A",specification:"40A",preferred_vendor:"SynthParts Co",vendor_sku:"SP-DUP77",vendor_url:"https://vendor.example/dup77",confidence:"medium",fit_summary:"Best match"},',
    '  {part_name:"Synthetic relay candidate B",part_number:"ALT-555",alternate_part_numbers:[],category:"electrical",manufacturer:"TE Connectivity",description:"B",specification:"30A",preferred_vendor:"",vendor_sku:"",vendor_url:"",confidence:"low",fit_summary:"Alternative"},',
    '  {part_name:"Synthetic relay candidate C",part_number:"SUP-90",alternate_part_numbers:[],category:"electrical",manufacturer:"Omron",description:"C",specification:"35A",preferred_vendor:"",vendor_sku:"",vendor_url:"",confidence:"low",fit_summary:"Superseded"},',
    ' ],',
    ' vendor_options:[',
    '  {vendor:"SynthParts Co",sku:"SP-DUP77",url:"https://vendor.example/dup77",est_price:"$8-12"},',
    '  {vendor:"FleetSupply",sku:"FS-900",url:"https://fleetsupply.example/dup77",est_price:"$10-14"},',
    ' ],',
    '};',
    'export const base44 = {',
    ' integrations:{Core:{',
    '  async UploadFile(){ uploadCount++; return {file_url:"https://files.example/photo-"+uploadCount+".png"}; },',
    '  async InvokeLLM(args){ state.llmCalls.push(clone(args)); if(args.response_json_schema?.properties?.fitment) return {fitment:targetsFit()}; return clone(aiResult); }',
    ' }},',
    ' functions:{async invoke(name,payload){',
    '   state.actions.push({name,payload:clone(payload)});',
    '   if(name==="fleetPartLookupAction"&&payload.action==="analyze_result"){',
    '     if(state.failNextAnalyze){state.failNextAnalyze=false;throw new Error("Synthetic analyze failure");}',
    '     const identification={id:"ident-"+payload.creation_key,updated_date:"v"+(++revision),...clone(payload.identification),search_mode:payload.search_mode,status:"needs_review"};',
    '     return {data:{success:true,identification,duplicate_part_ids:["part-dup"]}};',
    '   }',
    '   if(name==="fleetRequestAction"&&payload.action==="create"){',
    '     const row={id:"req-"+(++revision),status:"pending",...clone(payload.request)};',
    '     state.requestRows.push(row);',
    '     return {data:{success:true,request:clone(row)}};',
    '   }',
    '   if(name==="fleetPartLookupAction"&&payload.action==="match_existing"){',
    '     return {data:{success:true,identification:{id:payload.id,updated_date:"v"+(++revision),status:"matched_existing"},part:{id:payload.part_id,part_name:"Synthetic duplicate relay",part_number:"DUP-77",manufacturer:"Bosch"}}};',
    '   }',
    '   if(name==="fleetPartLookupAction"&&payload.action==="promote"){',
    '     return {data:{success:true,part:{id:"part-new",part_name:payload.part.part_name,part_number:payload.part.part_number,manufacturer:payload.part.manufacturer},identification:{id:payload.id,updated_date:"v"+(++revision),status:"promoted"}}};',
    '   }',
    '   if(name==="fleetPartLookupAction"&&payload.action==="update_review"){',
    '     return {data:{success:true,identification:{id:payload.id,updated_date:"v"+(++revision)},duplicate_part_ids:[]}};',
    '   }',
    '   throw new Error("Unexpected synthetic invoke: "+name+" "+payload.action);',
    ' }}',
    '};',
    'function targetsFit(){',
    ' const call=state.llmCalls[state.llmCalls.length-1];',
    ' const ids=JSON.parse(call.prompt.match(/Equipment units: (\\[.*\\])/s)[1]).map(t=>t.id);',
    ' return ids.map((id,i)=>({equipment_id:id,verdict:i===0?"fits":"unlikely",reason:"Synthetic verdict "+i}));',
    '}',
  ].join("\n"));

  vite = await createServer({
    configFile: false, root: scratch, plugins: [react()],
    resolve: { alias: [
      { find: "@/api/base44Client", replacement: path.join(scratch, "mockBase44.js") },
      { find: /^@\//, replacement: path.join(appRoot, "src") + "/" },
    ]},
    server: { host: "127.0.0.1", port: 0, strictPort: false, fs: { allow: [appRoot, scratch], strict: false } },
    logLevel: "error",
  });
  await vite.listen();
  const origin = "http://127.0.0.1:" + vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  async function run(name, width, scenario) {
    const page = await browser.newPage({ viewport: { width, height: width < 500 ? 844 : 900 } });
    const runtimeErrors = [], outside = [];
    page.on("pageerror", e => runtimeErrors.push(e.message));
    page.on("request", r => { if (r.url().startsWith("http") && !r.url().startsWith(origin)) outside.push(r.url()); });
    await page.route("**/*", route => {
      const url = route.request().url();
      return url.startsWith("http") && !url.startsWith(origin) ? route.abort("blockedbyclient") : route.continue();
    });
    try {
      await page.goto(origin, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Identify This Part" }).waitFor();
      await scenario(page);
      assert.deepEqual(runtimeErrors, [], "No browser runtime errors");
      assert.deepEqual(outside, [], "No outside network requests");
      passed++;
      console.log("PASS " + name);
    } finally {
      await page.close();
    }
  }

  const actions = (page, name, action) => page.evaluate(([n, a]) =>
    window.__fleetPartLookupFixture.actions.filter(x => x.name === n && (!a || x.payload.action === a)), [name, action]);
  const identify = async (page, queryText) => {
    await page.getByPlaceholder(/WIX 51515/).fill(queryText);
    await page.getByRole("button", { name: "Identify This Part" }).click();
    await page.getByText("Verify the identity").waitFor();
  };

  await run("Desktop: typing a stocked part number surfaces it before any AI call", 1440, async page => {
    await page.getByPlaceholder(/WIX 51515/).fill("SYN-FLT-100");
    await page.getByText("Already in Fleet inventory").waitFor();
    await page.getByText("stock 6").waitFor();
    await page.getByText(/Shelf 3 · B12/).waitFor();
    assert.equal((await actions(page, "fleetPartLookupAction")).length, 0);
    await page.getByRole("button", { name: "Request more" }).click();
    await page.getByText("Request Synthetic stocked filter").waitFor();
  });

  await run("Desktop: multi-candidate result renders a picker that repopulates the form", 1440, async page => {
    await identify(page, "synthetic relay lookup");
    await page.getByText(/AI returned 3 plausible identities/).waitFor();
    assert.equal(await page.getByLabel("Primary part number").inputValue(), "DUP-77");
    await page.getByRole("button", { name: /Synthetic relay candidate B/ }).click();
    assert.equal(await page.getByLabel("Primary part number").inputValue(), "ALT-555");
    assert.equal(await page.getByLabel("Part name *").inputValue(), "Synthetic relay candidate B");
    await page.getByRole("button", { name: /Synthetic relay candidate C/ }).click();
    assert.equal(await page.getByLabel("Primary part number").inputValue(), "SUP-90");
    await page.getByText("Best match").waitFor();
    await page.getByText("Superseded").waitFor();
  });

  await run("Desktop: per-field confidence badges and research links render in verify", 1440, async page => {
    await identify(page, "relay fields");
    await page.getByText("AI high").first().waitFor();
    assert.ok((await page.getByText("AI low").count()) >= 1, "low-confidence badge renders");
    const link = page.getByRole("link", { name: /docs\.example/ });
    await link.waitFor();
    assert.equal(await link.getAttribute("rel"), "noreferrer");
    await page.getByRole("link", { name: /Vendor\s*listing|SynthParts Co listing/ }).waitFor();
    await page.getByText("Detected label text").waitFor();
    await page.getByText("DUP-77 MADE IN GERMANY").waitFor();
  });

  await run("Desktop: duplicate card shows location and raises a linked request", 1440, async page => {
    await identify(page, "duplicate check");
    await page.getByText("Possible duplicate found").waitFor();
    await page.getByText("Location: Cabinet 2").waitFor();
    await page.getByRole("button", { name: "Request more of this" }).click();
    await page.getByText(/Linked to the exact Fleet inventory record/).waitFor();
    await page.getByLabel("Qty needed").fill("4");
    await page.getByRole("button", { name: "Submit Request" }).click();
    await page.getByText(/Request submitted/).waitFor();
    const rows = await actions(page, "fleetRequestAction", "create");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].payload.request.inventory_item_id, "part-dup");
    assert.equal(rows[0].payload.request.quantity_needed, 4);
    assert.match(rows[0].payload.creation_key, /^partlookup-request-/);
  });

  await run("Mobile: cross-reference chip starts a fresh session with the number loaded", 390, async page => {
    await identify(page, "relay with alternates");
    await page.getByText("Cross-reference numbers", { exact: true }).waitFor();
    const firstKey = (await actions(page, "fleetPartLookupAction", "analyze_result"))[0].payload.creation_key;
    await page.getByRole("button", { name: "ALT-555", exact: true }).click();
    await page.getByText(/Loaded ALT-555 for a new lookup/).waitFor();
    await page.getByText("What do you have?").waitFor();
    assert.equal(await page.getByPlaceholder(/WIX 51515/).inputValue(), "ALT-555");
    await page.getByRole("button", { name: "Identify This Part" }).click();
    await page.getByText("Verify the identity").waitFor();
    const rows = await actions(page, "fleetPartLookupAction", "analyze_result");
    assert.equal(rows.length, 2);
    assert.notEqual(rows[1].payload.creation_key, firstKey, "re-search must create a new session");
  });

  await run("Desktop: two photos are both uploaded and sent to the model", 1440, async page => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles([
      { name: "label.png", mimeType: "image/png", buffer: png },
      { name: "whole.png", mimeType: "image/png", buffer: png },
    ]);
    await page.getByText("2 photos").waitFor();
    await page.getByAltText("Part photo 2").waitFor();
    await identify(page, "two photo relay");
    const llm = await page.evaluate(() => window.__fleetPartLookupFixture.llmCalls.filter(c => c.file_urls));
    assert.equal(llm[0].file_urls.length, 2);
    const analyze = await actions(page, "fleetPartLookupAction", "analyze_result");
    assert.equal(analyze[0].payload.search_mode, "combined");
    assert.equal(analyze[0].payload.identification.uploaded_photo_urls.length, 2);
  });

  await run("Desktop: resume strip reloads an open inbox session into verify", 1440, async page => {
    await page.getByText("Resume a recent lookup").waitFor();
    await page.getByRole("button", { name: /Resumed synthetic part/ }).click();
    await page.getByText("Verify the identity").waitFor();
    assert.equal(await page.getByLabel("Primary part number").inputValue(), "RES-55");
    await page.getByText("Resumed from the Parts Identification Review Inbox.").waitFor();
    assert.equal(await page.getByText(/Old promoted/).count(), 0, "terminal sessions must not appear in the resume strip");
    assert.equal((await actions(page, "fleetPartLookupAction")).length, 0, "resume must not call the backend");
  });

  await run("Mobile: barcode Enter triggers a barcode-mode identification", 390, async page => {
    const input = page.getByPlaceholder("Detected automatically, scanned, or typed");
    await input.fill("012345678905");
    await input.press("Enter");
    await page.getByText("Verify the identity").waitFor();
    const rows = await actions(page, "fleetPartLookupAction", "analyze_result");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].payload.search_mode, "barcode");
  });

  await run("Desktop: fitment check returns per-equipment verdicts without changing selections", 1440, async page => {
    await identify(page, "fitment relay");
    await page.getByRole("button", { name: "Organize It" }).click();
    await page.getByText("Compatible equipment").waitFor();
    await page.getByRole("button", { name: /Synthetic Truck 7/ }).click();
    await page.getByRole("button", { name: /Synthetic Excavator 3/ }).click();
    await page.getByRole("button", { name: "Check fitment" }).click();
    await page.getByText("Fits — Synthetic verdict 0").waitFor();
    await page.getByText(/Unlikely — Synthetic verdict 1/).waitFor();
    assert.equal(await page.getByText(/AI fitment check complete for 2 selections/).count(), 1);
    await page.getByText("AI vendor options — tap to apply").waitFor();
    await page.getByRole("button", { name: /FleetSupply/ }).click();
    assert.equal(await page.getByLabel("Vendor SKU").inputValue(), "FS-900");
    assert.equal(await page.getByLabel("Preferred vendor").inputValue(), "FleetSupply");
  });

  console.log("PART_LOOKUP_BROWSER_PASS=" + passed);
} finally {
  await browser?.close();
  await vite?.close();
  await rm(scratch, { recursive: true, force: true });
}
