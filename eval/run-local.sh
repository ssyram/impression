#!/usr/bin/env bash
# Local-only launcher. Reads url+token from ~/.claude.yunwu.json into env (never into a
# committable file), then runs the eval against configs.local.json (gitignored).
# Usage: ./run-local.sh [--judge MODEL] [--only id1,id2]
set -euo pipefail

CFG="$HOME/.claude.yunwu.json"
[ -f "$CFG" ] || { echo "missing $CFG" >&2; exit 1; }

export IMPRESSION_EVAL_URL="$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.claude.yunwu.json")))["env"]["ANTHROPIC_BASE_URL"].rstrip("/")+"/v1")')"
export IMPRESSION_EVAL_KEY="$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.claude.yunwu.json")))["env"]["ANTHROPIC_AUTH_TOKEN"])')"

cd "$(dirname "$0")"
exec python3 run_eval.py --configs configs.local.json "$@"
