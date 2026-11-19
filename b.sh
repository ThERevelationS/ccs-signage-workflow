echo "=== L04 file-entities gateway leak test ==="
for f in File FileBlob FileNode FileVersion FileShare FileActivity FileComment FilePermission CustomerFolderLink; do
  for g in staffDataRead staffEntityWrite boardFeedFields; do
    grep -rln "'$f'\|\"$f\"" base44/functions/$g/ base44/shared/$g* src/lib/$g* 2>/dev/null | head -1
  done
done | sort -u
echo "=== O07 safeExternalUrl content ==="
cat src/utils/safeExternalUrl.js 2>/dev/null | head -30
echo "=== O03 usePolling ==="
grep -nE "visibility|clearInterval|unmount|document.hidden|setInterval" src/lib/usePolling.js | head -8
echo "=== E07 fuel guards ==="
grep -rnE "delete|unlink|orphan" src/components/fleet/FleetPart* src/components/fleet/FleetInventory* 2>/dev/null | head -5
echo "=== E08 maps key ==="
grep -rlnE "loadGoogleMaps|maps.google|apiKey|api_key" src/ | head -4
