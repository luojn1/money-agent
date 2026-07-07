"""Small local embedding helpers for offline RAG retrieval.

The module intentionally avoids a hard dependency on remote embedding services so
the MVP can run during class demos. The API is shaped so sentence-transformers or
OpenAI embeddings can replace this implementation later.
"""

from __future__ import annotations

import math
import re
from collections import Counter


TOKEN_PATTERN = re.compile(r"[\u4e00-\u9fff]{1}|[A-Za-z0-9_.%-]+")


def tokenize(text: str) -> list[str]:
    """Tokenize Chinese text by character and Latin text by word-like chunks."""
    return [token.lower() for token in TOKEN_PATTERN.findall(text or "")]


def text_vector(text: str) -> Counter[str]:
    """Return a simple term-frequency vector."""
    return Counter(tokenize(text))


def cosine_similarity(left: Counter[str], right: Counter[str]) -> float:
    """Compute cosine similarity between sparse term-frequency vectors."""
    if not left or not right:
        return 0.0
    common = set(left) & set(right)
    numerator = sum(left[token] * right[token] for token in common)
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return numerator / (left_norm * right_norm)
