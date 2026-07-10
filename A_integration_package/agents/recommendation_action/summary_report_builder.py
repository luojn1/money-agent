# -*- coding: utf-8 -*-
"""D/backend adapter for building the 30-second summary report.

In the integrated repo, place `summary_report/summary_builder.py` at repo root
and call `build_summary(b_output, c_output, d_output)` after D finishes.
"""

from __future__ import annotations

from typing import Any

from summary_report.summary_builder import build_summary


def build_recommendation_summary_report(
    b_output: dict[str, Any],
    c_output: dict[str, Any],
    d_output: dict[str, Any],
) -> dict[str, Any]:
    """Build a default one-page summary from B/C/D outputs."""
    return build_summary(b_output, c_output, d_output)

