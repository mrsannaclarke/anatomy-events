#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
REMOTE_NAME="${GH_PAGES_REMOTE:-origin}"
BRANCH="${GH_PAGES_BRANCH:-gh-pages}"
REPO_URL="$(git -C "$ROOT_DIR" remote get-url "$REMOTE_NAME")"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/anatomy-events-gh-pages.XXXXXX")"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [[ ! -d "$DIST_DIR" ]]; then
  echo "dist directory is missing. Run 'npm run predeploy' first."
  exit 1
fi

while IFS= read -r -d '' file; do
  perl -0pi -e 's#/assets/node_modules/@#/assets/node_modules/%40#g; s#assets/node_modules/@#assets/node_modules/%40#g' "$file"
done < <(find "$DIST_DIR" -type f \( -name '*.js' -o -name '*.html' -o -name '*.json' \) -print0)

if git -C "$ROOT_DIR" ls-remote --exit-code --heads "$REPO_URL" "$BRANCH" >/dev/null 2>&1; then
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP_DIR" >/dev/null
else
  git clone --depth 1 "$REPO_URL" "$TMP_DIR" >/dev/null
  git -C "$TMP_DIR" checkout --orphan "$BRANCH" >/dev/null
  git -C "$TMP_DIR" rm -rf . >/dev/null 2>&1 || true
fi

rsync -a --delete --exclude='.git' "$DIST_DIR"/ "$TMP_DIR"/
touch "$TMP_DIR/.nojekyll"
rm -rf "$TMP_DIR/.vscode" "$TMP_DIR/.gitignore"

git -C "$TMP_DIR" add -A -f
if git -C "$TMP_DIR" diff --cached --quiet; then
  echo "No gh-pages changes to publish."
  exit 0
fi

timestamp="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
git -C "$TMP_DIR" commit -m "Deploy web build ($timestamp)" >/dev/null
git -C "$TMP_DIR" push origin "$BRANCH"

echo "Published web build to $REMOTE_NAME/$BRANCH"
