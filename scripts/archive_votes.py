#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 ntfy.sh 近 12 小时的投票增量合并进 votes-archive.json（GitHub Actions 定时跑）。"""
import base64
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / "vote-config.json").read_text(encoding="utf-8"))
ARCHIVE = ROOT / CFG["archive"]
URL = "https://ntfy.sh/{}/json?poll=1".format(CFG["topic"])


def read_archive():
    if not ARCHIVE.exists():
        return []
    try:
        data = json.loads(ARCHIVE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def read_live():
    req = urllib.request.Request(URL, headers={"User-Agent": "calendar-vote-archiver"})
    with urllib.request.urlopen(req, timeout=45) as r:
        text = r.read().decode("utf-8", "replace")
    out = []
    for line in text.splitlines():
        if not line.strip():
            continue
        try:
            e = json.loads(line)
        except Exception:
            continue
        if e.get("event") != "message" or not e.get("message"):
            continue
        try:
            out.append(json.loads(e["message"]))
        except Exception:
            continue
    return out


def raw_id(v):
    """微信 ID 在公开数据里是 b64_ 编码，判断测试标记前先解码。"""
    s = str(v or "")
    if s.startswith("b64_"):
        try:
            return base64.b64decode(s[4:]).decode("utf-8")
        except Exception:
            return s
    return s


def main():
    merged = {}
    for r in read_archive() + read_live():
        if not isinstance(r, dict) or not r.get("vid") or not r.get("wechat_id"):
            continue
        if raw_id(r["wechat_id"]).startswith("__"):  # 过滤测试数据
            continue
        merged[r["vid"]] = r

    # 同一微信号在同一组只保留最新一条
    latest = {}
    for r in merged.values():
        key = (r.get("wechat_id"), r.get("orientation"))
        if key not in latest or str(r.get("created_at", "")) > str(latest[key].get("created_at", "")):
            latest[key] = r
    result = sorted(latest.values(), key=lambda r: str(r.get("created_at", "")))
    ARCHIVE.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print("archived {} votes".format(len(result)))


if __name__ == "__main__":
    main()
