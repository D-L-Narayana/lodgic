#!/usr/bin/env python3
"""Train the hotel learning-to-rank model used by the Lodgic search engine.

Pointwise logistic regression trained on synthetic search sessions:

* Every session shows 20 candidate hotels; each candidate has a hidden *utility*
  (how much this traveller would like it) that depends on price, rating, review
  volume, distance, star class, popularity and policies, plus noise.
* A booking happens with probability sigmoid(utility) *only if the traveller
  examined the candidate*, and examination decays with rank position (position
  bias, as in real click logs). The logged data is therefore biased towards
  whatever the production ranker (here: price ascending) showed first.
* We fit logistic regression with full-batch gradient descent + L2 on
  standardised features (numpy only, no scikit-learn) and evaluate NDCG@10 on
  held-out sessions using the hidden utility as graded relevance, against
  price-ascending and rating-descending baselines.

Outputs `src/core/model.ts` (weights, standardisation stats, metrics) and
`ml/metrics.json`. Deterministic: seed 7.

Run:  python3 ml/train_ranker.py
"""
from __future__ import annotations

import json
import math
import pathlib
import sys

import numpy as np

FEATURES = [
    "log_price",
    "rating",
    "log_reviews",
    "distance_km",
    "stars",
    "popularity",
    "free_cancellation",
    "breakfast",
]
SEED = 7
SESSIONS = 50_000
CANDIDATES = 20
K = 10


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate_candidates(rng: np.random.Generator, n: int) -> np.ndarray:
    """Return an (n, 8) feature matrix that mimics the seeded catalogue."""
    stars = rng.choice([1, 2, 3, 4, 5], size=n, p=[0.05, 0.15, 0.35, 0.30, 0.15])
    base_price = np.array([1200, 2200, 3800, 7000, 14000])[stars - 1] * rng.lognormal(0, 0.25, n)
    rating = np.clip(rng.normal(6.2 + 0.55 * stars, 0.9, n), 2.0, 10.0)
    reviews = rng.lognormal(4.5 + 0.3 * stars, 0.9, n)
    distance = rng.gamma(2.0, 2.2, n)
    popularity = np.clip(rng.beta(2, 5, n) + 0.05 * (stars - 3), 0, 1)
    free_cancel = (rng.random(n) < 0.55).astype(float)
    breakfast = (rng.random(n) < 0.3 + 0.1 * stars).astype(float)
    return np.column_stack(
        [np.log(base_price), rating, np.log1p(reviews), distance, stars.astype(float), popularity, free_cancel, breakfast]
    )


def hidden_utility(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Ground-truth traveller utility (unknown to the model)."""
    log_price, rating, log_reviews, distance, stars, popularity, free_cancel, breakfast = x.T
    u = (
        -1.35 * (log_price - np.log(4000))
        + 0.75 * (rating - 7.5)
        + 0.25 * (log_reviews - 5)
        - 0.18 * (distance - 4)
        + 0.15 * (stars - 3)
        + 0.9 * (popularity - 0.3)
        + 0.35 * free_cancel
        + 0.3 * breakfast
        + rng.normal(0, 0.6, len(x))
    )
    return u - 2.2  # base booking propensity ~10 %


def simulate_sessions(rng: np.random.Generator, sessions: int):
    """Simulate logged sessions ranked by the *production* ranker: price ascending."""
    X, y, groups, utils = [], [], [], []
    for s in range(sessions):
        x = generate_candidates(rng, CANDIDATES)
        u = hidden_utility(x, rng)
        order = np.argsort(x[:, 0])  # production ranker: cheapest first
        x, u = x[order], u[order]
        position = np.arange(CANDIDATES)
        examined = rng.random(CANDIDATES) < 1.0 / np.sqrt(1 + position)  # position bias
        booked = (rng.random(CANDIDATES) < sigmoid(u)) & examined
        X.append(x)
        y.append(booked.astype(float))
        groups.append(np.full(CANDIDATES, s))
        utils.append(u)
    return np.vstack(X), np.concatenate(y), np.concatenate(groups), np.concatenate(utils)


def fit_logreg(X: np.ndarray, y: np.ndarray, l2: float = 1e-3, epochs: int = 400, lr: float = 0.5):
    n, d = X.shape
    w = np.zeros(d)
    b = 0.0
    for _ in range(epochs):
        p = sigmoid(X @ w + b)
        g = p - y
        w -= lr * (X.T @ g / n + l2 * w)
        b -= lr * g.mean()
    return w, b


def dcg(rels: np.ndarray) -> float:
    return float(np.sum((2 ** rels - 1) / np.log2(np.arange(2, len(rels) + 2))))


def ndcg_at_k(scores: np.ndarray, rel: np.ndarray, k: int) -> float:
    order = np.argsort(-scores)[:k]
    ideal = np.sort(rel)[::-1][:k]
    idcg = dcg(ideal)
    return dcg(rel[order]) / idcg if idcg > 0 else 0.0


def graded_relevance(u: np.ndarray) -> np.ndarray:
    """Map hidden utility to 0..4 grades per session (quantile based)."""
    ranks = u.argsort().argsort()
    return np.floor(ranks / len(u) * 5).clip(0, 4)


def evaluate(Xz: np.ndarray, X: np.ndarray, groups: np.ndarray, utils: np.ndarray, w: np.ndarray, b: float):
    model, price, rating, random_ = [], [], [], []
    rng = np.random.default_rng(SEED + 1)
    for g in np.unique(groups):
        idx = groups == g
        rel = graded_relevance(utils[idx])
        model.append(ndcg_at_k(Xz[idx] @ w + b, rel, K))
        price.append(ndcg_at_k(-X[idx, 0], rel, K))
        rating.append(ndcg_at_k(X[idx, 1], rel, K))
        random_.append(ndcg_at_k(rng.random(idx.sum()), rel, K))
    return {
        "ndcg@10_model": float(np.mean(model)),
        "ndcg@10_price_asc": float(np.mean(price)),
        "ndcg@10_rating_desc": float(np.mean(rating)),
        "ndcg@10_random": float(np.mean(random_)),
    }


def main() -> None:
    rng = np.random.default_rng(SEED)
    X, y, groups, utils = simulate_sessions(rng, SESSIONS)
    n_train = int(SESSIONS * 0.8) * CANDIDATES
    mean, std = X[:n_train].mean(axis=0), X[:n_train].std(axis=0)
    std[std == 0] = 1.0
    Xz = (X - mean) / std
    w, b = fit_logreg(Xz[:n_train], y[:n_train])

    p = sigmoid(Xz[n_train:] @ w + b)
    y_test = y[n_train:]
    logloss = float(-np.mean(y_test * np.log(p + 1e-12) + (1 - y_test) * np.log(1 - p + 1e-12)))
    # AUC via rank statistic
    order = np.argsort(p)
    ranks = np.empty(len(p))
    ranks[order] = np.arange(1, len(p) + 1)
    n_pos = y_test.sum()
    n_neg = len(y_test) - n_pos
    auc = float((ranks[y_test == 1].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))

    metrics = evaluate(Xz[n_train:], X[n_train:], groups[n_train:], utils[n_train:], w, b)
    metrics.update(
        {
            "test_logloss": logloss,
            "test_auc": auc,
            "train_sessions": SESSIONS * 4 // 5,
            "test_sessions": SESSIONS // 5,
            "candidates_per_session": CANDIDATES,
            "booking_rate": float(y.mean()),
            "lift_vs_price_sort_pct": 100 * (metrics["ndcg@10_model"] / metrics["ndcg@10_price_asc"] - 1),
            "lift_vs_rating_sort_pct": 100 * (metrics["ndcg@10_model"] / metrics["ndcg@10_rating_desc"] - 1),
        }
    )

    root = pathlib.Path(__file__).resolve().parents[1]
    (root / "ml" / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    ts = f"""/* AUTO-GENERATED by ml/train_ranker.py — do not edit by hand. */
export interface RankerModel {{
  readonly features: readonly string[];
  readonly mean: readonly number[];
  readonly std: readonly number[];
  readonly weights: readonly number[];
  readonly bias: number;
  readonly metrics: Readonly<Record<string, number>>;
}}

export const RANKER_MODEL: RankerModel = {{
  features: {json.dumps(FEATURES)},
  mean: {json.dumps([round(float(v), 6) for v in mean])},
  std: {json.dumps([round(float(v), 6) for v in std])},
  weights: {json.dumps([round(float(v), 6) for v in w])},
  bias: {round(float(b), 6)},
  metrics: {json.dumps({k: round(v, 4) for k, v in metrics.items()}, indent=4)},
}};
"""
    (root / "src" / "core" / "model.ts").write_text(ts)
    print(json.dumps(metrics, indent=2))
    print("weights:", dict(zip(FEATURES, np.round(w, 4))))
    print("bias:", round(b, 4))


if __name__ == "__main__":
    sys.exit(main())
