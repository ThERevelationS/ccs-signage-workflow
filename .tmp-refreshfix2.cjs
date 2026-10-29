const fs = require('fs');
const p = 'src/components/timeclock/TimeTracker.jsx';
let t = fs.readFileSync(p, 'utf8');
const anchor = 'const onChange = () => { refresh({ force: true }).catch(() => {}); };';
const replacement = `const onChange = (event) => {
      const incoming = event?.detail?.prefs;
      if (incoming && typeof incoming === "object") {
        setSnapshotRecord(prev => prev && prev.scope === scopeRef.current && prev.data
          ? { ...prev, data: { ...prev.data, prefs: incoming } }
          : prev);
      }
      refresh({ force: true }).catch(() => {});
    };`;
if (!t.includes(anchor)) { console.log('anchor missing'); process.exit(1); }
t = t.replace(anchor, replacement);
fs.writeFileSync(p, t);
console.log('patched');
