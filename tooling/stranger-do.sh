#!/bin/zsh
# usage: stranger-do.sh <name>  (body on stdin)
set -e
Q=/private/tmp/ais6-stranger-queue
N="$1"
cat > "$Q/cmd-$N.mjs"
for i in {1..300}; do
  if [ -f "$Q/out-$N.json" ]; then cat "$Q/out-$N.json"; rm "$Q/out-$N.json"; exit 0; fi
  sleep 0.3
done
echo '{"ok":false,"error":"timeout"}'
