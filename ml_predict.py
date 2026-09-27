import json
import random
from pathlib import Path
from typing import Dict, List, Tuple
from urllib.request import Request, urlopen

import numpy as np


DATA_FILE = Path("lotto-data.json")
OUTPUT_FILE = Path("ml-prediction.json")
FIREBASE_URL = "https://lotte01-131ea-default-rtdb.asia-southeast1.firebasedatabase.app/lottoNumbers.json"
MAX_DRAWS = 50


def parse_draws(raw: object) -> List[List[int]]:
    if not isinstance(raw, list):
        raise ValueError("로또 데이터 형식이 배열이 아닙니다.")

    draws: List[List[int]] = []
    for i, draw in enumerate(raw):
        numbers = draw.get("numbers") if isinstance(draw, dict) else draw
        if not isinstance(numbers, list):
            print(f"[WARN] 회차 인덱스 {i} 번호 목록을 읽을 수 없어 제외됨: {draw}")
            continue
        nums = []
        for n in numbers:
            if isinstance(n, int) and 1 <= n <= 45:
                nums.append(n)
        nums = sorted(set(nums))
        if len(nums) == 6:
            draws.append(nums)
        else:
            print(f"[WARN] 회차 인덱스 {i} 데이터가 유효하지 않아 제외됨: {draw}")
    return draws


def load_draws(path: Path) -> List[List[int]]:
    with path.open("r", encoding="utf-8") as f:
        return parse_draws(json.load(f))


def load_latest_draws(path: Path) -> List[List[int]]:
    try:
        request = Request(FIREBASE_URL, headers={"User-Agent": "lotto-number-recommender"})
        with urlopen(request, timeout=15) as response:
            raw = json.load(response)

        if not isinstance(raw, list):
            raise ValueError("Firebase 로또 데이터 형식이 배열이 아닙니다.")

        records = [record for record in raw if isinstance(record, dict)]
        records.sort(key=lambda record: int(record.get("drawNumber", 0)))
        draws = parse_draws(records)
        if not draws:
            raise ValueError("Firebase에서 유효한 로또 회차를 찾지 못했습니다.")

        latest_draws = draws[-MAX_DRAWS:]
        print(f"[DATA] Firebase에서 최신 {len(latest_draws)}회차 로드")
        return latest_draws
    except (OSError, TimeoutError, ValueError) as error:
        print(f"[WARN] Firebase 데이터 로드 실패, 로컬 데이터로 대체: {error}")

    draws = load_draws(path)
    latest_draws = draws[-MAX_DRAWS:]
    print(f"[DATA] 로컬 파일에서 {len(latest_draws)}회차 로드")
    return latest_draws


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
    verbose: bool = True,
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

        if verbose and (epoch % 300 == 0 or epoch == epochs - 1):
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


def fit_logistic_model(
    x_train: np.ndarray,
    y_train: np.ndarray,
    verbose: bool = False,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    mean = x_train.mean(axis=0, keepdims=True)
    std = x_train.std(axis=0, keepdims=True)
    std[std < 1e-8] = 1.0

    x_train_n = (x_train - mean) / std
    w, b = train_multilabel_logistic_regression(x_train_n, y_train, verbose=verbose)
    return w, b, mean, std


def walk_forward_backtest(
    draws: List[List[int]],
    min_history: int = 10,
    min_training_samples: int = 6,
    random_repetitions: int = 500,
) -> Dict[str, object]:
    model_hits = []
    frequency_hits = []
    random_hit_total = 0
    rng = random.Random(42)

    first_test_index = min_history + min_training_samples
    for target_index in range(first_test_index, len(draws)):
        history = draws[:target_index]
        actual = draws[target_index]
        x_train, y_train = build_dataset(history, min_history=min_history)
        if x_train.shape[0] < min_training_samples:
            continue

        w, b, mean, std = fit_logistic_model(x_train, y_train)
        next_x = build_feature(history).reshape(1, -1)
        model_probs = predict_probabilities((next_x - mean) / std, w, b).ravel()
        model_hits.append(evaluate_hits(top6_from_probs(model_probs), actual))

        history_vectors = np.array([encode_draw(draw) for draw in history], dtype=np.float64)
        frequency_scores = build_frequency_feature(history_vectors, 20)
        frequency_hits.append(evaluate_hits(top6_from_probs(frequency_scores), actual))

        for _ in range(random_repetitions):
            random_pick = rng.sample(range(1, 46), 6)
            random_hit_total += evaluate_hits(random_pick, actual)

    hit_distribution: Dict[str, int] = {str(i): 0 for i in range(7)}
    for hit_count in model_hits:
        hit_distribution[str(hit_count)] += 1

    random_trial_count = len(model_hits) * random_repetitions
    return {
        "mean_hit_count": float(np.mean(model_hits)) if model_hits else 0.0,
        "max_hit_count": int(np.max(model_hits)) if model_hits else 0,
        "hit_distribution": hit_distribution,
        "walk_forward_draw_count": len(model_hits),
        "frequency_mean_hit_count": float(np.mean(frequency_hits)) if frequency_hits else 0.0,
        "random_simulated_mean_hit_count": random_hit_total / random_trial_count if random_trial_count else 0.0,
        "random_expected_hit_count": 0.8,
    }


def weighted_sample_without_replacement(probs: np.ndarray, k: int, rng: random.Random) -> List[int]:
    numbers = list(range(1, 46))
    weights = np.clip(probs, 1e-8, None).tolist()
    choices = []

    for _ in range(min(k, len(numbers))):
        selected_index = rng.choices(range(len(numbers)), weights=weights, k=1)[0]
        choices.append(numbers.pop(selected_index))
        weights.pop(selected_index)

    return sorted(choices)


def generate_combinations(probs: np.ndarray, count: int = 10, k: int = 6, seed: int = 42) -> List[List[int]]:
    rng = random.Random(seed)
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
    draws = load_latest_draws(DATA_FILE)
    if len(draws) < 16:
        raise ValueError("학습을 위해 최소 16회차 이상의 데이터가 필요합니다.")

    x, y = build_dataset(draws, min_history=10)
    if x.shape[0] < 6:
        raise ValueError("학습 샘플이 너무 적습니다. 데이터 회차를 늘려주세요.")

    backtest = walk_forward_backtest(draws, min_history=10)

    # Fit the next-draw model on every available supervised training example.
    w, b, mean, std = fit_logistic_model(x, y, verbose=True)

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
        "train_sample_count": int(x.shape[0]),
        "test_sample_count": int(backtest["walk_forward_draw_count"]),
        "feature_size": int(x.shape[1]),
        "backtest": backtest,
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
    print(f"최종 모델 학습 샘플: {output['train_sample_count']}")
    print(f"순차 백테스트 회차: {output['test_sample_count']}")
    print(f"백테스트 평균 일치 개수: {output['backtest']['mean_hit_count']:.3f}")
    print(f"최근 빈도순 평균 일치 개수: {output['backtest']['frequency_mean_hit_count']:.3f}")
    print(f"무작위 시뮬레이션 평균 일치 개수: {output['backtest']['random_simulated_mean_hit_count']:.3f}")
    print(f"무작위 기대 일치 개수: {output['backtest']['random_expected_hit_count']:.3f}")
    print(f"다음 회차 Top6: {next_top6}")
    print(f"결과 파일: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
