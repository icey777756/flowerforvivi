#!/usr/bin/env bash
# 一键发布到 GitHub Pages（需要已安装 gh 并登录）
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v gh >/dev/null 2>&1; then
  echo "未找到 gh。请先安装 GitHub CLI：brew install gh"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "尚未登录 GitHub，正在打开设备码登录…"
  gh auth login --hostname github.com --git-protocol https --web
fi

OWNER="$(gh api user --jq .login)"
REPO="flowerforvivi"
URL="https://${OWNER}.github.io/${REPO}/"

git add -A
if ! git diff --cached --quiet; then
  git commit -m "update: 指尖生花"
fi

if ! gh repo view "${OWNER}/${REPO}" >/dev/null 2>&1; then
  gh repo create "${REPO}" --public --source=. --remote=origin \
    --description "指尖生花 · 手机端手势粒子花朵（MediaPipe Hands + Three.js）"
else
  if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "https://github.com/${OWNER}/${REPO}.git"
  fi
fi

git push -u origin main

if ! gh api "repos/${OWNER}/${REPO}/pages" >/dev/null 2>&1; then
  gh api -X POST "repos/${OWNER}/${REPO}/pages" \
    -f "source[branch]=main" -f "source[path]=/" >/dev/null
  echo "已开启 GitHub Pages，首次构建大约需要 1 分钟。"
fi

echo ""
echo "发布完成：${URL}"
