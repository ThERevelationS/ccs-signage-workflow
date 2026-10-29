// Interactive visual harness for the Time Tracker — a Vite page that renders
// a variant matrix of TimeTrackerPreview plus the real TimeTrackerSettings card
// with a mocked prefs read. Run: node scripts/preview-timeclock-tracker.mjs
// Prints the URL to open (or drive via Playwright).
import { mkdtemp, writeFile, symlink, copyFile, readdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const root = process.cwd();
const scratch = realpathSync(await mkdtemp(path.join(tmpdir(), "tracker-preview-")));

await symlink(path.join(root, "node_modules"), path.join(scratch, "node_modules"), "junction");
const assets = await readdir(path.join(root, "dist/assets"));
const css = assets.find((name) => name.endsWith(".css"));
if (!css) { console.error("Run npm run build first — need dist/assets/*.css"); process.exit(1); }
await copyFile(path.join(root, "dist/assets", css), path.join(scratch, "styles.css"));

await writeFile(path.join(scratch, "index.html"),
  '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div>' +
  '<script type="module" src="/main.jsx"></script></body></html>');

await writeFile(path.join(scratch, "mock.js"), `
export const base44 = {
  entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) }),
  functions: { async invoke(name, payload) {
    if (name === "timeClockAction" && payload?.action === "time_tracker_prefs_get") {
      return { data: { success: true, prefs: {} } };
    }
    if (name === "timeClockAction" && payload?.action === "time_tracker_prefs_update") {
      return { data: { success: true, prefs: payload.prefs } };
    }
    if (name === "timeClockAction" && payload?.action === "time_tracker_snapshot") {
      return { data: { success: true, status: "clocked_in", prefs: { tracker_enabled: true },
        paid_minutes_today: 302.4, elapsed_minutes_today: 330.1, weekly_paid_minutes: 1510,
        break_minutes: 30, paid_break_minutes: 15, pause_minutes: 10, accruing_paid: true,
        company_day: "2026-10-27", server_time: new Date().toISOString(),
        weekly_daily_minutes: [420, 460, 380, 250, 0, 0, 0] } };
    }
    return { data: { success: false, error: "mock: " + name } };
  } },
  integrations: { Core: new Proxy({}, { get: () => async () => ({}) }) },
};
export const useAuth = () => ({ sessionToken: "synthetic",
  currentUser: { id: "u1", email: "worker@synthetic.invalid", full_name: "Synthetic Worker", role: "user" } });
export const getSessionToken = () => "synthetic";
export const getSessionUser = () => useAuth().currentUser;
export function AuthProvider({children}) { return children; }
`);

const f = (p) => "/@fs/" + path.join(root, p).split(path.sep).join("/");
await writeFile(path.join(scratch, "main.jsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { TimeTrackerPreview } from "${f("src/components/timeclock/TimeTracker.jsx")}";
import TimeTrackerSettings from "${f("src/components/timeclock/TimeTrackerSettings.jsx")}";

const styles = ["ring","donut","arc","bar","badge","minimal","flip","roll"];
const bgs = ["minimal","glass","solid","outline","soft","accent","halo","dotted","striped","elevated","inset","neon","pearl","carbon","mesh","aurora","dusk","forest","ocean","sunset","berry","mono"];
const anims = ["pulse","glow","breathe","sweep","wave","sparkle","float","flicker","rainbow","pop","wobble","ripple","shake","gradient"];
const accents = ["indigo","emerald","rose","fuchsia","amber","slate","navy","#ff5500","#00b3a4"];

const which = new URLSearchParams(location.search).get("v") || "all";
const base = { tracker_enabled: true, daily_goal_minutes: 480, size: "expanded", show_icon: true };

function Grid({title, list, make}) {
  return <div style={{margin:"18px 0"}}>
    <h3 style={{font:"bold 13px system-ui", margin:"0 0 6px", textTransform:"uppercase", letterSpacing:"1px"}}>{title}</h3>
    <div style={{display:"flex", flexWrap:"wrap", gap:"8px", alignItems:"center"}}>
      {list.map(v => <div key={v} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
        {make(v)}
        <span style={{font:"9px system-ui",color:"#64748b"}}>{v}</span>
      </div>)}
    </div>
  </div>;
}

function App() {
  if (which === "settings") {
    return <div style={{maxWidth:860, margin:"0 auto", padding:16}}>
      <TimeTrackerSettings currentUser={{email:"worker@synthetic.invalid"}} sessionToken="synthetic" />
    </div>;
  }
  return <div style={{padding:16, background:"#f8fafc", fontFamily:"system-ui"}}>
    <Grid title="Display styles" list={styles} make={(v)=><TimeTrackerPreview prefs={{...base, display_style:v}}/>}/>
    <Grid title="Backgrounds (indigo)" list={bgs} make={(v)=><TimeTrackerPreview prefs={{...base, background_style:v}}/>}/>
    <Grid title="Backgrounds (hex #ff5500)" list={bgs.slice(1,8)} make={(v)=><TimeTrackerPreview prefs={{...base, background_style:v, accent_color:"#ff5500"}}/>}/>
    <Grid title="Animations" list={anims} make={(v)=><TimeTrackerPreview prefs={{...base, animation_style:v}}/>}/>
    <Grid title="Accents" list={accents} make={(v)=><TimeTrackerPreview prefs={{...base, accent_color:v}}/>}/>
  </div>;
}

createRoot(document.getElementById("root")).render(
  <MemoryRouter><App/></MemoryRouter>
);
`);

const vite = await createServer({
  configFile: false, root: scratch,
  plugins: [react()],
  resolve: { alias: [
    { find: "@/api/base44Client", replacement: path.join(scratch, "mock.js") },
    { find: "@/components/auth/EmailGate", replacement: path.join(scratch, "mock.js") },
    { find: /^@\//, replacement: path.join(root, "src") + "/" },
  ] },
  server: { host: "127.0.0.1", port: 0, fs: { strict: false, allow: [root, scratch] } },
  logLevel: "error",
});
await vite.listen();
const port = vite.httpServer.address().port;
console.log("TRACKER_PREVIEW_URL=http://127.0.0.1:" + port);
console.log("VARIANTS: /  (matrix)   ?v=settings  (settings card)");
setInterval(() => {}, 60000); // keep alive
