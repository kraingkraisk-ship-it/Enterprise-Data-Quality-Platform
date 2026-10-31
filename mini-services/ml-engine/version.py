#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""รายงานเวอร์ชัน scikit-learn ของเอนจิน (ใช้โดย GET /health)"""
import json

import sklearn

print(json.dumps({"version": sklearn.__version__}, ensure_ascii=False))
