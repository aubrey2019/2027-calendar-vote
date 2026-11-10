#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 votes-archive.json 里的历史投票一次性迁到 Supabase。

用法：
  SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... \
    python3 scripts/migrate_to_supabase.py

只需 anon key（RLS 已允许 anon INSERT）。重复执行安全：vid 唯一 + ignore-duplicates。
"""
import json
import os
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_ANON_KEY", "")
if not URL or not KEY:
    raise SystemExit("请先设置环境变量 SUPABASE_URL 和 SUPABASE_ANON_KEY")

rows = json.loads((ROOT / "votes-archive.json").read_text(encoding="utf-8"))
payload = [{
    "vid": r["vid"],
    "wechat_id": r["wechat_id"],      # 已是 b64_ 编码，保持
    "orientation": r["orientation"],
    "picks": r["picks"],
    "created_at": r["created_at"],
} for r in rows if not str(r.get("wechat_id", "")).startswith("__")]

req = urllib.request.Request(
    URL + "/rest/v1/votes",
    data=json.dumps(payload).encode("utf-8"),
    method="POST",
    headers={
        "apikey": KEY,
        "Authorization": "Bearer " + KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation,resolution=ignore-duplicates",
    },
)
with urllib.request.urlopen(req, timeout=60) as resp:
    body = resp.read().decode("utf-8", "replace")
    print("HTTP", resp.status)

# 读回校验
check = urllib.request.Request(
    URL + "/rest/v1/votes?select=vid",
    headers={"apikey": KEY, "Authorization": "Bearer " + KEY},
)
with urllib.request.urlopen(check, timeout=60) as resp:
    got = json.load(resp)
print("提交", len(payload), "条；库内现有", len(got), "条")
