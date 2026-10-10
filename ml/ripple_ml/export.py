"""
Exports LightGBM boosters to a compact JSON tree format that ClaimWing evaluates in TypeScript
(lib/ripple/gbdt.ts), so production needs no Python runtime or separate inference service.

Tree format: parallel arrays. ``left``/``right`` hold a node index when >= 0, or ``-(leaf + 1)``
for a leaf. Numeric splits go left when ``x <= threshold``. Missing values follow LightGBM's rules:
for ``missing_type`` "NaN" a NaN goes to the default side; otherwise NaN is treated as 0, and for
"Zero" a zero goes to the default side.
"""
from __future__ import annotations

import numpy as np


def _flatten(tree: dict) -> dict:
    feat, thr, dleft, mtype, left, right, leaves = [], [], [], [], [], [], []

    def walk(node: dict) -> int:
        if "leaf_index" in node or "leaf_value" in node and "split_index" not in node:
            leaves.append(float(node["leaf_value"]))
            return -len(leaves)
        if node.get("decision_type", "<=") != "<=":
            raise ValueError("only numeric <= splits are supported; do not use categorical features")
        i = len(feat)
        feat.append(int(node["split_feature"]))
        thr.append(float(node["threshold"]))
        dleft.append(1 if node.get("default_left", True) else 0)
        mtype.append({"None": 0, "Zero": 1, "NaN": 2}[node.get("missing_type", "None")])
        left.append(0)
        right.append(0)
        left[i] = walk(node["left_child"])
        right[i] = walk(node["right_child"])
        return i

    root = walk(tree["tree_structure"])
    if root < 0:  # a single-leaf tree
        return {"feature": [], "threshold": [], "default_left": [], "missing_type": [], "left": [], "right": [], "leaf": leaves, "root": root}
    return {"feature": feat, "threshold": thr, "default_left": dleft, "missing_type": mtype, "left": left, "right": right, "leaf": leaves, "root": root}


def export_booster(booster, objective: str) -> dict:
    dump = booster.dump_model()
    trees = [_flatten(t) for t in dump["tree_info"]]
    return {"objective": objective, "num_features": len(dump["feature_names"]), "feature_names": dump["feature_names"], "trees": trees}


def raw_score(model: dict, x: np.ndarray) -> float:
    """Reference implementation of the TypeScript evaluator, used to verify the export."""
    total = 0.0
    for t in model["trees"]:
        node = t["root"]
        while node >= 0:
            v = x[t["feature"][node]]
            mt = t["missing_type"][node]
            if np.isnan(v) and mt != 2:
                v = 0.0
            if (mt == 2 and np.isnan(v)) or (mt == 1 and v == 0.0):
                go_left = bool(t["default_left"][node])
            else:
                go_left = v <= t["threshold"][node]
            node = t["left"][node] if go_left else t["right"][node]
        total += t["leaf"][-node - 1]
    return total


def isotonic_export(iso) -> dict:
    """Piecewise-linear isotonic map as two arrays (clipped at the ends)."""
    return {"x": [float(v) for v in iso.X_thresholds_], "y": [float(v) for v in iso.y_thresholds_]}


def apply_isotonic(cal: dict, p: np.ndarray) -> np.ndarray:
    return np.interp(p, cal["x"], cal["y"])
