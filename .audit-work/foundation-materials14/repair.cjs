const fs = require('fs');
const p = '.audit-work/foundation-materials14/activate-reviewed.cjs';
let s = fs.readFileSync(p, 'utf8');
// canonical schema desired: ASCII-escaped + trailing NL
s = s.replace(
  `return [file, file.endsWith(".jsonc") ? JSON.stringify(JSON.parse(text), null, 2) + "\n" : lf(text)];`,
  `const canon = (t) => JSON.stringify(JSON.parse(t), null, 2).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n';
  return [file, file.endsWith(".jsonc") ? canon(text) : lf(text)];`
);
// journal: preserve/append instead of replace
s = s.replace(
  `const journal = [];
const record = entry => {
  journal.push({ at: new Date().toISOString(), ...entry });
  persist("activation-journal", journal);
};`,
  `const journal = fs.existsSync(\`\${OUT}/activation-journal.json\`) ? load(\`\${OUT}/activation-journal.json\`) : [];
const record = entry => {
  journal.push({ at: new Date().toISOString(), ...entry });
  persist("activation-journal", journal);
};
const RESUME = process.argv.includes('--resume');
const firstStart = (journal.find(e => e.event === 'preflight_verified' && e.start)?.start) || null;`
);
// resume gate: skip schema edit + allow canonical match; all other files baseline-exact
s = s.replace(
  `  for (const file of paths) {
    let original = fresh.files.find(row => row.path === file).content;
    const payload = () => JSON.stringify([{ old_text: original, new_text: desired.get(file), replace_all: false }]);
    let diff;
    try { diff = sandbox(["edit", file, "--dry-run"], payload()); }
    catch (error) {
      if (!/old_text not found|EDIT_TEXT_NOT_FOUND/i.test(String(error) + String(error.stdout || ""))) throw error;
      original = lf(original).replace(/\n/g, "\r\n");
      diff = sandbox(["edit", file, "--dry-run"], payload());
    }
    assert.ok(!diff.error, \`Dry-run failed: \${file}\`);
    persist(\`dryrun-\${file.split("/").at(-1)}\`, diff);
    edits.set(file, payload());
  }
  record({ event: "all_edit_previews_saved", files: paths });`,
  `  for (const file of paths) {
    const remote = fresh.files.find(row => row.path === file);
    if (RESUME && file.endsWith('.jsonc')) {
      // resume: schema may already be at canonical desired — verify deepEqual + skip
      assert.ok(same(lf(remote.content), desired.get(file)) || same(lf(remote.content), canon(remote.content)),
        \`resume schema mismatch: \${file}\`);
      assert.deepEqual(JSON.parse(remote.content), JSON.parse(fs.readFileSync(file, 'utf8')), \`resume schema semantic: \${file}\`);
      record({ event: 'already_verified_schema', file });
      continue;
    }
    assert.ok(same(lf(remote.content), lf(baseline.get(file))), \`resume baseline drift: \${file}\`);
    let original = remote.content;
    const payload = () => JSON.stringify([{ old_text: original, new_text: desired.get(file), replace_all: false }]);
    let diff;
    try { diff = sandbox(["edit", file, "--dry-run"], payload()); }
    catch (error) {
      if (!/old_text not found|EDIT_TEXT_NOT_FOUND/i.test(String(error) + String(error.stdout || ""))) throw error;
      original = lf(original).replace(/\n/g, "\r\n");
      diff = sandbox(["edit", file, "--dry-run"], payload());
    }
    assert.ok(!diff.error, \`Dry-run failed: \${file}\`);
    persist(\`dryrun-\${file.split("/").at(-1)}\`, diff);
    edits.set(file, payload());
  }
  record({ event: "all_edit_previews_saved", files: paths, resumed: RESUME });`
);
// writes loop: skip schema when resume (already verified)
s = s.replace(
  `  for (const file of paths) {
    try { record({ event: "edit_response", file, result: sandbox(["edit", file], edits.get(file)) }); }`,
  `  for (const file of paths) {
    if (RESUME && file.endsWith('.jsonc')) { readback(file); continue; }
    try { record({ event: "edit_response", file, result: sandbox(["edit", file], edits.get(file)) }); }`
);
// final changed-path check uses firstStart (original preflight start), not resumed HEAD
s = s.replace(
  `  const changed = command(\`git diff --name-only \${start} HEAD\`, "remote-changed-paths").split(/\r?\n/).filter(Boolean);`,
  `  const changed = command(\`git diff --name-only \${RESUME && firstStart ? firstStart : start} HEAD\`, "remote-changed-paths").split(/\r?\n/).filter(Boolean);`
);
fs.writeFileSync(p, s);
console.log('repaired');
