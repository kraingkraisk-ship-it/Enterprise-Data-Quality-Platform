#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ml-engine — ผู้เทรนโมเดลด้วย scikit-learn (Task 67 / v0.37.0)

อ่าน JSON จาก stdin:
  { modelKey, train: [{features: {...}, y: 0|1}], test: [...], randomState }

หลักการ (คงเดิมจากแพลตฟอร์ม):
  - ชุดฝึก = ข้อมูลจริงจาก Data Asset · ผู้ติดป้าย = กฎ DQ ทุกข้อ (+ ข้อมูลสอนจากมนุษย์)
  - การแบ่ง train/test ทำฝั่งแพลตฟอร์ม (deterministic ตรวจย้อนได้) — สคริปต์นี้รับชุดที่แบ่งแล้ว
  - เวกเตอร์คุณลักษณะ = หลักฐานรายคอลัมน์ (null:คอลัมน์, dup:คอลัมน์, shape:คอลัมน์, range:คอลัมน์)
    → LogisticRegression เรียนรู้สัมประสิทธิ์รายหลักฐาน อ่านเหตุผลย้อนได้ (โปร่งใส ไม่กล่องดำ)

คืน JSON ทาง stdout:
  { ok, metrics{accuracy,precision,recall,f1,rocAuc,tp,fp,tn,fn}, testProbabilities[],
    coefficients[], intercept, featureCount, sklearnVersion, modelKey }

บันทึกโมเดล (joblib) ไว้ที่ models/{modelKey}.joblib เพื่อให้ predict.py ใช้งาน
"""
import json
import os

import joblib
import sklearn
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)


def safe_key(raw: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in raw)


def run():
    req = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    train = req.get("train") or []
    test = req.get("test") or []
    model_key = safe_key(str(req.get("modelKey") or "model"))
    random_state = int(req.get("randomState") or 42)

    y_train = [int(r["y"]) for r in train]
    if len(set(y_train)) < 2:
        print(json.dumps({"ok": False, "error": "SINGLE_CLASS"}))
        return

    vec = DictVectorizer(sparse=True)
    x_train = vec.fit_transform([dict(r.get("features") or {}) for r in train])
    clf = LogisticRegression(max_iter=1000, class_weight="balanced", random_state=random_state)
    clf.fit(x_train, y_train)

    out = {
        "ok": True,
        "sklearnVersion": sklearn.__version__,
        "featureCount": int(len(vec.feature_names_)),
        "intercept": round(float(clf.intercept_[0]), 4),
        "modelKey": model_key,
    }

    metrics = {"accuracy": None, "precision": None, "recall": None, "f1": None, "rocAuc": None, "tp": 0, "fp": 0, "tn": 0, "fn": 0}
    probs_test = []
    if test:
        x_test = vec.transform([dict(r.get("features") or {}) for r in test])
        y_test = [int(r["y"]) for r in test]
        probs = clf.predict_proba(x_test)[:, 1]
        probs_test = [round(float(p), 4) for p in probs]
        y_pred = [1 if p >= 0.5 else 0 for p in probs]
        metrics["accuracy"] = round(float(accuracy_score(y_test, y_pred)), 4)
        metrics["precision"] = round(float(precision_score(y_test, y_pred, zero_division=0)), 4)
        metrics["recall"] = round(float(recall_score(y_test, y_pred, zero_division=0)), 4)
        metrics["f1"] = round(float(f1_score(y_test, y_pred, zero_division=0)), 4)
        tn, fp, fn, tp = confusion_matrix(y_test, y_pred, labels=[0, 1]).ravel()
        metrics.update({"tp": int(tp), "fp": int(fp), "tn": int(tn), "fn": int(fn)})
        if len(set(y_test)) >= 2:
            metrics["rocAuc"] = round(float(roc_auc_score(y_test, probs)), 4)
    out["metrics"] = metrics
    out["testProbabilities"] = probs_test

    coefs = [{"name": n, "weight": round(float(w), 4)} for n, w in zip(vec.feature_names_, clf.coef_[0])]
    coefs.sort(key=lambda c: -abs(c["weight"]))
    out["coefficients"] = coefs[:60]

    model_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
    os.makedirs(model_dir, exist_ok=True)
    joblib.dump(
        {
            "vectorizer": vec,
            "clf": clf,
            "featureNames": list(vec.feature_names_),
            "sklearnVersion": sklearn.__version__,
        },
        os.path.join(model_dir, model_key + ".joblib"),
    )
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    import sys

    try:
        run()
    except Exception as exc:  # noqa: BLE001 — คืน error เป็น JSON เสมอ
        print(json.dumps({"ok": False, "error": "TRAIN_FAILED", "detail": str(exc)[:400]}))
