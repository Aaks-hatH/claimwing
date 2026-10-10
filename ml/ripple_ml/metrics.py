"""Evaluation metrics. Everything here is plain numpy so the numbers are easy to audit."""
from __future__ import annotations

import numpy as np

EPS = 1e-6


def brier(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean((p - y) ** 2))


def log_loss(y: np.ndarray, p: np.ndarray) -> float:
    p = np.clip(p, EPS, 1 - EPS)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def auc(y: np.ndarray, p: np.ndarray) -> float | None:
    pos, neg = p[y == 1], p[y == 0]
    if len(pos) == 0 or len(neg) == 0:
        return None
    order = np.argsort(np.concatenate([pos, neg]), kind="mergesort")
    ranks = np.empty(len(order))
    ranks[order] = np.arange(1, len(order) + 1)
    # Average ranks for ties.
    allp = np.concatenate([pos, neg])
    _, inv, counts = np.unique(allp, return_inverse=True, return_counts=True)
    sums = np.bincount(inv, weights=ranks)
    ranks = (sums / counts)[inv]
    return float((ranks[: len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def reliability(y: np.ndarray, p: np.ndarray, bins: int = 10) -> tuple[list[dict], float]:
    """Equal-width bins. Returns the table and the expected calibration error (ECE)."""
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, bins - 1)
    table, ece = [], 0.0
    for b in range(bins):
        m = idx == b
        if not m.any():
            continue
        mean_p, rate = float(p[m].mean()), float(y[m].mean())
        ece += m.mean() * abs(mean_p - rate)
        table.append({"bin": f"{edges[b]:.1f}-{edges[b + 1]:.1f}", "n": int(m.sum()), "mean_predicted": round(mean_p, 4), "observed_rate": round(rate, 4)})
    return table, float(ece)


def precision_recall(y: np.ndarray, p: np.ndarray, cut: float) -> dict:
    pred = p >= cut
    tp = float(np.sum(pred & (y == 1)))
    fp = float(np.sum(pred & (y == 0)))
    fn = float(np.sum(~pred & (y == 1)))
    return {
        "cutoff": round(cut, 4),
        "precision": round(tp / (tp + fp), 4) if tp + fp else None,
        "recall": round(tp / (tp + fn), 4) if tp + fn else None,
        "flagged_share": round(float(pred.mean()), 4),
    }


def classification_report(y: np.ndarray, p: np.ndarray) -> dict:
    table, ece = reliability(y, p)
    base = float(y.mean())
    return {
        "n": int(len(y)),
        "positive_rate": round(base, 4),
        "brier": round(brier(y, p), 5),
        # Brier skill versus always predicting the evaluation period's own base rate.
        "brier_skill_vs_base_rate": round(1 - brier(y, p) / max(brier(y, np.full_like(p, base)), EPS), 4),
        "log_loss": round(log_loss(y, p), 5),
        "auc": None if auc(y, p) is None else round(auc(y, p), 4),
        "ece": round(ece, 4),
        "reliability": table,
        "at_0_5": precision_recall(y, p, 0.5),
        "at_2x_base_rate": precision_recall(y, p, min(0.95, 2 * base)),
    }


def regression_report(y: np.ndarray, yhat: np.ndarray) -> dict:
    err = yhat - y
    buckets = [(-1e9, 15, "under 15 min"), (15, 60, "15-59 min"), (60, 180, "60-179 min"), (180, 1e9, "180+ min")]
    by = []
    for lo, hi, name in buckets:
        m = (y >= lo) & (y < hi)
        if m.any():
            by.append({"actual_delay": name, "n": int(m.sum()), "mae": round(float(np.abs(err[m]).mean()), 2), "bias": round(float(err[m].mean()), 2)})
    return {
        "n": int(len(y)),
        "mae": round(float(np.abs(err).mean()), 2),
        "median_abs_error": round(float(np.median(np.abs(err))), 2),
        "bias": round(float(err.mean()), 2),
        "by_actual_delay": by,
    }
