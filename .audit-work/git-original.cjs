// usage: node git-original.cjs <rev> <outDir> <relPath...> — fetch file@rev from sandbox git via base64
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const APP = "68dfcc5e57bbbc35387da97c";
const [rev, outDir, ...files] = process.argv.slice(2);
for (const p of files) {
  const out = execFileSync("cmd.exe", ["/c", "npx", "base44@latest", "sandbox", "run", `git show ${rev}:${p} | base64 -w0`, "--app-id", APP, "--branch", "main", "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 256 << 20 });
  const j = JSON.parse(out.slice(out.indexOf("{")));
  if (j.truncated || j.exitCode !== 0 || !j.stdout) { console.log(p, "FAILED", j.truncated ? "truncated" : j.stderr?.slice(0, 120)); continue; }
  const buf = Buffer.from(j.stdout.trim(), "base64");
  const dest = path.join(outDir, p);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log(p, "OK", buf.length, "bytes");
}
