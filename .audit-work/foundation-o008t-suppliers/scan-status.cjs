let s = '';
process.stdin.on('data', d => s += d).on('end', () => {
  const i = s.indexOf('{');
  const j = JSON.parse(s.slice(i));
  const str = JSON.stringify(j);
  for (const key of ['preview_status', 'build_error', 'sandbox_status', 'preview_url']) {
    const re = new RegExp('"' + key + '":("(?:[^"\\\\]|\\\\.)*"|null|[^,}\\]]+)', 'g');
    const m = str.match(re);
    console.log(key, '->', m ? m.slice(0, 8) : 'NOT FOUND');
  }
  console.log('top keys:', Object.keys(j).join(','));
});
