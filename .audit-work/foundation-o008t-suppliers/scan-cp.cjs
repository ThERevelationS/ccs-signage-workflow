let s = '';
process.stdin.on('data', d => s += d).on('end', () => {
  const i = s.indexOf('[');
  const arr = JSON.parse(s.slice(i));
  for (const c of arr.slice(0, 4)) {
    console.log(JSON.stringify({ id: c.id, name: c.name, git: c.git_commit_hash, preview_status: c.preview_status, build_error: c.build_error, build_ended_at: c.build_ended_at }));
  }
});
