#!/bin/bash
# push.sh <localpath> — chunked base64 push via sandbox run, retry on busy
P="$1"
APPID="68dfcc5e57bbbc35387da97c"
SIZE=$(stat -c%s "$P")
CHUNK=3400
N=$(( (SIZE + CHUNK - 1) / CHUNK ))
TMP="${P}.pushpart"
echo "Pushing $P ($SIZE bytes, $N chunks)"
for ((c=0; c<N; c++)); do
  B64=$(dd if="$P" bs=$CHUNK skip=$c count=1 2>/dev/null | base64 -w0)
  if [ $c -eq 0 ]; then OP=">"; else OP=">>"; fi
  if [ $c -eq $((N-1)) ]; then
    CMD="echo '$B64' | base64 -d $OP $TMP && mv $TMP $P"
  else
    CMD="echo '$B64' | base64 -d $OP $TMP"
  fi
  ok=0
  for i in 1 2 3 4 5 6 7 8 9 10; do
    OUT=$(npx base44@latest sandbox run "$CMD" --app-id $APPID --branch main --json 2>&1 | tail -12)
    if echo "$OUT" | grep -q "exitCode.: 0"; then ok=1; break; fi
    if echo "$OUT" | grep -qi "busy\|COMMIT_FLUSH"; then echo "  chunk $c attempt $i: busy, retrying"; sleep 75; else echo "  chunk $c attempt $i: $(echo "$OUT" | head -3)"; sleep 20; fi
  done
  if [ $ok -ne 1 ]; then echo "FAILED chunk $c of $P"; exit 1; fi
  echo "  chunk $c ok"
done
npx base44@latest sandbox run "md5sum $P" --app-id $APPID --branch main --json 2>&1 | tail -10
