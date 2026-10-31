#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ml-engine — พยากรณ์ด้วยโมเดล scikit-learn ที่เทรนไว้ (Task 67 / v0.37.0)

อ่าน JSON จาก stdin: { modelKey, rows: [features: {...}] }
คืน JSON ทาง stdout: { ok, probabilities: [...] } — ความน่าจะเป็น "ไม่ถูกต้อง" (คลาส 1) รายแถว ตามลำดับที่ส่งมา
"""
import json
import os

import joblib


def safe_key(raw: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in raw)


def run():
    req = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    model_key = safe_key(str(req.get("modelKey") or "model"))
    rows = req.get("rows") or []
    if not rows:
        print(json.dumps({"ok": True, "probabilities": []}))
        return

    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", model_key + ".joblib")
    if not os.path.exists(path):
        print(json.dumps({"ok": False, "error": "MODEL_NOT_FOUND"}))
        return

    bundle = joblib.load(path)
    vec = bundle["vectorizer"]
    clf = bundle["clf"]
    x = vec.transform([dict(r or {}) for r in rows])
    probs = clf.predict_proba(x)[:, 1]
    print(json.dumps({"ok": True, "probabilities": [round(float(p), 4) for p in probs]}, ensure_ascii=False))


if __name__ == "__main__":
    import sys

    try:
        run()
    except Exception as exc:  # noqa: BLE001 — คืน error เป็น JSON เสมอ
        print(json.dumps({"ok": False, "error": "PREDICT_FAILED", "detail": str(exc)[:400]}))
