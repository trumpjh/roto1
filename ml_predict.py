import json
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np


DATA_FILE = Path("lotto-data.json")
OUTPUT_FILE = Path("ml-prediction.json")


def load_draws(path: Path) -> List[List[int]]:
    with path.open("r", encoding="utf-8") as f:
        raw = json.load(f)

    draws: List[List[int]] = []
    for i, draw in enumerate(raw):
        if not isinstance(draw, list):
            continue
        nums = []
        for n in draw:
            if isinstance(n, int) and 1 <= n <= 45:
                nums.append(n)
        nums = sorted(set(nums))
        if len(nums) == 6:
            draws.append(nums)
        else:
            print(f"[WARN] 회차 인덱스 {i} 데이터가 유효하지 않아 제외됨: {draw}")
    return draws


def encode_draw(draw: List[int]) -> np.ndarray:
    v = np.zeros(45, dtype=np.float64)
    for n in draw:
        v[n - 1] = 1.0
    return v


def build_frequency_feature(history_vectors: np.ndarray, window: int) -> np.ndarray:
    if history_vectors.shape[0] == 0:
        return np.zeros(45, dtype=np.float64)
    actual_window = min(window, history_vectors.shape[0])
    freq = history_vectors[-actual_window:].sum(axis=0) / float(actual_window)
    return freq


def build_gap_feature(history_draws: List[List[int]], max_gap: int = 50) -> np.ndarray:
    gaps = np.full(45, float(max_gap), dtype=np.float64)
    for idx in range(45):
        target = idx + 1
        found = False
        for back, draw in enumerate(reversed(history_draws), start=1):
            if target in draw:
                gaps[idx] = float(back)
                found = True
                break
        if not found:
            gaps[idx] = float(max_gap)
    return np.minimum(gaps, max_gap) / float(max_gap)


def build_feature(history_draws: List[List[int]]) -> np.ndarray:
    history_vectors = np.array([encode_draw(d) for d in history_draws], dtype=np.float64)
    f5 = build_frequency_feature(history_vectors, 5)
    f10 = build_frequency_feature(history_vectors, 10)
    f20 = build_frequency_feature(history_vectors, 20)
    gaps = build_gap_feature(history_draws)
    return np.concatenate([f5, f10, f20, gaps], axis=0)


def build_dataset(draws: List[List[int]], min_history: int = 10) -> Tuple[np.ndarray, np.ndarray]:
    xs = []
    ys = []
    for t in range(min_history, len(draws)):
        history = draws[:t]
        target = draws[t]
        xs.append(build_feature(history))
        ys.append(encode_draw(target))

    if not xs:
        return np.empty((0, 180), dtype=np.float64), np.empty((0, 45), dtype=np.float64)

    return np.array(xs, dtype=np.float64), np.array(ys, dtype=np.float64)


def sigmoid(z: np.ndarray) -> np.ndarray:
    z = np.clip(z, -30, 30)
    return 1.0 / (1.0 + np.exp(-z))


def train_multilabel_logistic_regression(
    x_train: np.ndarray,
    y_train: np.ndarray,
    lr: float = 0.1,
    epochs: int = 1200,
    l2: float = 1e-3,
) -> Tuple[np.ndarray, np.ndarray]:
    n_samples, n_features = x_train.shape
    n_outputs = y_train.shape[1]

    w = np.zeros((n_features, n_outputs), dtype=np.float64)
    b = np.zeros((1, n_outputs), dtype=np.float64)

    for epoch in range(epochs):
        logits = x_train @ w + b
        preds = sigmoid(logits)

        err = preds - y_train
        grad_w = (x_train.T @ err) / n_samples + l2 * w
        grad_b = err.mean(axis=0, keepdims=True)

        w -= lr * grad_w
        b -= lr * grad_b

        if epoch % 300 == 0 or epoch == epochs - 1:
            eps = 1e-9
            loss = -(y_train * np.log(preds + eps) + (1 - y_train) * np.log(1 - preds + eps)).mean()
            print(f"[TRAIN] epoch={epoch:4d} loss={loss:.6f}")

    return w, b


def predict_probabilities(x: np.ndarray, w: np.ndarray, b: np.ndarray) -> np.ndarray:
    return sigmoid(x @ w + b)


def top6_from_probs(probs: np.ndarray) -> List[int]:
    indices = np.argsort(probs)[-6:]
    return sorted((indices + 1).tolist())


def evaluate_hits(predicted: List[int], actual: List[int]) -> int:
    return len(set(predicted) & set(actual))


def weighted_sample_without_replacement(probs: np.ndarray, k: int, rng: np.random.Generator) -> List[int]:
    p = np.clip(probs, 1e-8, None)
    p = p / p.sum()
    choices = rng.choice(np.arange(1, 46), size=k, replace=False, p=p)
    return sorted(choices.tolist())


def generate_combinations(probs: np.ndarray, count: int = 10, k: int = 6, seed: int = 42) -> List[List[int]]:
    rng = np.random.default_rng(seed)
    combos: List[List[int]] = []
    seen = set()

    attempts = 0
    while len(combos) < count and attempts < count * 200:
        combo = weighted_sample_without_replacement(probs, k, rng)
        key = tuple(combo)
        if key not in seen:
            seen.add(key)
            combos.append(combo)
        attempts += 1
    return combos


def main() -> None:
    if not DATA_FILE.exists():
        raise FileNotFoundError("lotto-data.json 파일을 찾을 수 없습니다.")

    draws = load_draws(DATA_FILE)
    if len(draws) < 16:
        raise ValueError("학습을 위해 최소 16회차 이상의 데이터가 필요합니다.")

    x, y = build_dataset(draws, min_history=10)
    if x.shape[0] < 6:
        raise ValueError("학습 샘플이 너무 적습니다. 데이터 회차를 늘려주세요.")

    test_size = max(3, x.shape[0] // 4)
    train_size = x.shape[0] - test_size

    x_train = x[:train_size]
    y_train = y[:train_size]
    x_test = x[train_size:]
    y_test = y[train_size:]

    # 피처 정규화
    mean = x_train.mean(axis=0, keepdims=True)
    std = x_train.std(axis=0, keepdims=True)
    std[std < 1e-8] = 1.0

    x_train_n = (x_train - mean) / std
    x_test_n = (x_test - mean) / std

    w, b = train_multilabel_logistic_regression(x_train_n, y_train)

    test_probs = predict_probabilities(x_test_n, w, b)
    hit_counts = []
    for i in range(test_probs.shape[0]):
        pred = top6_from_probs(test_probs[i])
        actual = (np.where(y_test[i] > 0.5)[0] + 1).tolist()
        hit_counts.append(evaluate_hits(pred, actual))

    hit_distribution: Dict[str, int] = {str(i): 0 for i in range(7)}
    for h in hit_counts:
        hit_distribution[str(h)] += 1

    # 다음 회차 입력 피처: 전체 draws를 history로 사용
    next_x = build_feature(draws).reshape(1, -1)
    next_x_n = (next_x - mean) / std
    next_probs = predict_probabilities(next_x_n, w, b).ravel()

    next_top6 = top6_from_probs(next_probs)
    combos = generate_combinations(next_probs, count=10, k=6, seed=42)

    ranked = np.argsort(next_probs)[::-1]
    top_prob_numbers = [
        {"number": int(idx + 1), "probability": float(next_probs[idx])}
        for idx in ranked[:15]
    ]

    output = {
        "model": "NumPy Multi-label Logistic Regression",
        "data_draw_count": len(draws),
        "train_sample_count": int(train_size),
        "test_sample_count": int(test_size),
        "feature_size": int(x.shape[1]),
        "backtest": {
            "mean_hit_count": float(np.mean(hit_counts)) if hit_counts else 0.0,
            "max_hit_count": int(np.max(hit_counts)) if hit_counts else 0,
            "hit_distribution": hit_distribution,
        },
        "next_draw_prediction": {
            "top6_numbers": next_top6,
            "top_prob_numbers": top_prob_numbers,
            "generated_combinations": combos,
        },
    }

    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print("\n=== ML 예측 완료 ===")
    print(f"모델: {output['model']}")
    print(f"데이터 회차 수: {output['data_draw_count']}")
    print(f"학습/테스트 샘플: {train_size}/{test_size}")
    print(f"백테스트 평균 일치 개수: {output['backtest']['mean_hit_count']:.3f}")
    print(f"다음 회차 Top6: {next_top6}")
    print(f"결과 파일: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
