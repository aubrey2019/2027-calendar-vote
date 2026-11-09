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


def to_utc(v):
    """把 +08:00 / Z / 任意小数位的 ISO 时间统一成 UTC 毫秒 Z 格式；返回 (排序用时间戳, 规范字符串)。"""
    import re
    from datetime import datetime, timedelta, timezone
    m = re.match(r"(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d+))?(Z|[+-]\d\d:?\d\d)?$", str(v or "").strip())
    if not m:
        return 0.0, str(v or "")
    y, mo, d, h, mi, s, frac, tz = m.groups()
    us = int((frac or "0")[:6].ljust(6, "0"))
    dt = datetime(int(y), int(mo), int(d), int(h), int(mi), int(s), us)
    if tz and tz != "Z":
        sign = 1 if tz[0] == "+" else -1
        tz = tz[1:].replace(":", "")
        dt -= sign * timedelta(hours=int(tz[:2]), minutes=int(tz[2:]))
    dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp(), dt.strftime("%Y-%m-%dT%H:%M:%S.") + "{:03d}Z".format(dt.microsecond // 1000)


def main():
    merged = {}
    for r in read_archive() + read_live():
        if not isinstance(r, dict) or not r.get("vid") or not r.get("wechat_id"):
            continue
        if raw_id(r["wechat_id"]).startswith("__"):  # 过滤测试数据
            continue
        r["_ts"], r["created_at"] = to_utc(r.get("created_at"))
        merged[r["vid"]] = r

    # 同一微信号在同一组只保留最新一条（按真实时间比较，不按字符串）
    latest = {}
    for r in merged.values():
        key = (raw_id(r.get("wechat_id")), r.get("orientation"))
        if key not in latest or r["_ts"] > latest[key]["_ts"]:
            latest[key] = r
    result = sorted(latest.values(), key=lambda r: r["_ts"])
    for r in result:
        r.pop("_ts", None)
    ARCHIVE.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print("archived {} votes".format(len(result)))


if __name__ == "__main__":
    main()
