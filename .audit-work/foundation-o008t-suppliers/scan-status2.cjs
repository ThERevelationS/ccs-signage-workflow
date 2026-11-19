let s = '';
process.stdin.on('data', d => s += d).on('end', () => {
  const i = s.indexOf('{');
  const j = JSON.parse(s.slice(i));
  for (const k of ['last_git_commit_hash', 'last_head_move', 'environment_build', 'status', 'environment_url', 'sandbox_snapshot_id']) {
    console.log(k, '=', JSON.stringify(j[k])?.slice(0, 600));
  }
});
