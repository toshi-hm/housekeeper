#!/usr/bin/env bash
# 差分からベースブランチ比で実行すべきテストファイルを選定する。
#
#   usage: select-changed-tests.sh <base-ref>   (例: origin/develop)
#
# 出力 (stdout):
#   ALL            … 安全に絞り込めない変更を含む → フルスイートを実行すべき
#   NONE           … テストに影響する変更がない → テスト実行をスキップしてよい
#   <ファイル一覧> … 1 行 1 ファイル。`bun test <files>` に渡す
#
# 絞り込みルール:
#   - 変更されたテストファイル自身は常に対象
#   - 変更されたソース (src/**) は同ディレクトリの "*<basename>*.test.*" を対象に加える
#     (routes の "-_auth.index.more.test.tsx" 命名もこのパターンで拾える)
#   - 対応テストが見つからないソース変更・共有テストヘルパー (src/test/**)・
#     依存/設定ファイルの変更が含まれる場合は ALL にフォールバック (安全側)
set -euo pipefail

base_ref="${1:?usage: select-changed-tests.sh <base-ref>}"

changed=$(git diff --name-only "${base_ref}...HEAD")

declare -A selected=()
fallback_reason=""

add_matches() {
  while IFS= read -r match; do
    [ -n "$match" ] && selected["$match"]=1
  done <<< "$1"
}

while IFS= read -r file; do
  [ -n "$file" ] || continue

  # ドキュメント・Storybook・スタイルはユニットテストに影響しない
  case "$file" in
    *.md | docs/* | *.stories.tsx | *.css | .storybook/* | public/*) continue ;;
  esac

  # 共有テスト基盤・依存・ランタイム設定の変更は全テストに影響しうる
  case "$file" in
    src/test/* | src/mocks/* | bunfig.toml | package.json | bun.lock | .env.test | tsconfig*.json)
      fallback_reason="shared config/helper changed: $file"
      break
      ;;
  esac

  # テストファイル自身の変更 (削除されたものは除外)
  case "$file" in
    src/*.test.ts | src/*.test.tsx | src/*/*.test.ts | src/*/*.test.tsx | src/*/*/*.test.ts | src/*/*/*.test.tsx)
      [ -f "$file" ] && selected["$file"]=1
      continue
      ;;
  esac

  # src 配下のソース変更 → 同ディレクトリの対応テストを対象に加える
  case "$file" in
    src/*.ts | src/*.tsx | src/*/*.ts | src/*/*.tsx | src/*/*/*.ts | src/*/*/*.tsx)
      dir=$(dirname "$file")
      base=$(basename "$file")
      base="${base%.tsx}"
      base="${base%.ts}"
      matches=$(find "$dir" -maxdepth 1 \( -name "*${base}*.test.ts" -o -name "*${base}*.test.tsx" \) 2>/dev/null || true)
      if [ -z "$matches" ]; then
        fallback_reason="source without matching test changed: $file"
        break
      fi
      add_matches "$matches"
      continue
      ;;
  esac

  # 上記以外 (CI 設定・スクリプト・supabase functions など) は安全側でフル実行
  fallback_reason="non-src change: $file"
  break
done <<< "$changed"

if [ -n "$fallback_reason" ]; then
  echo "fallback to full suite: $fallback_reason" >&2
  echo "ALL"
elif [ "${#selected[@]}" -eq 0 ]; then
  echo "NONE"
else
  printf '%s\n' "${!selected[@]}" | sort
fi
