let data = "";
process.stdin.on("data", c => data += c);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(data);
    const f = j.files && j.files[0];
    if (!f) { console.error("NO FILE"); process.exit(2); }
    if (f.error) { console.error("FILE ERROR: " + JSON.stringify(f.error)); process.exit(3); }
    process.stdout.write(f.content);
  } catch (e) { console.error("PARSE FAIL: " + e.message); process.exit(1); }
});
