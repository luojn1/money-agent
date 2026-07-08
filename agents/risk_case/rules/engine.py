"""Risk rule engine for C Agent."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from rag.retriever import KnowledgeRetriever


RISK_CATEGORY_TO_CLAUSE_CATEGORY = {
    "cost_transparency": ["fee", "interest_fee"],
    "interest_fee": ["fee", "interest_fee"],
    "prepayment": ["prepayment"],
    "overdue": ["overdue"],
    "authorization_privacy": ["authorization_privacy", "autoDebit"],
    "repayment": ["repayment"],
    "dispute_resolution": ["dispute_resolution"],
    "other": ["other", "guarantee"],
}


@dataclass
class RuleHit:
    rule: dict[str, Any]
    score_deduction: int
    matched_clauses: list[dict[str, Any]]
    regulations: list[dict[str, Any]]
    cases: list[dict[str, Any]]
    products: list[dict[str, Any]]
    market_rates: list[dict[str, Any]]
    glossary_terms: list[dict[str, Any]]
    reason: str


@dataclass
class SkippedRule:
    rule_id: str
    rule_name: str
    category: str
    reason: str


def get_path(data: dict[str, Any], dotted_path: str) -> Any:
    """Read a value from a nested dictionary using paths like data.costAnalysis.x."""
    aliases = {
        "additionalFees": "data.costAnalysis.additionalFees",
        "realAnnualRate": "data.costAnalysis.realAnnualRate",
        "totalRepayment": "data.costAnalysis.totalRepayment",
        "loanAmount": "data.contractSummary.loanAmount",
        "actualReceivedAmount": "data.contractSummary.actualReceivedAmount",
        "prepaymentRule": "data.contractSummary.prepaymentRule",
        "overdueFee": "data.contractSummary.overdueFee",
        "repaymentMethod": "data.contractSummary.repaymentMethod",
        "productType": "data.contractSummary.productType",
        "nominalRate": "data.contractSummary.nominalRate",
    }
    dotted_path = aliases.get(dotted_path, dotted_path)
    current: Any = {"data": data}
    for part in dotted_path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def contains_any(value: str | None, needles: list[str]) -> bool:
    return any(needle and needle in (value or "") for needle in needles)


def contains_all(value: str | None, needles: list[str]) -> bool:
    clean_needles = [needle for needle in needles if needle]
    return bool(clean_needles) and all(needle in (value or "") for needle in clean_needles)


def condition_terms(condition: dict[str, Any]) -> list[str]:
    """Extract human terms from a rule condition for evidence matching."""
    terms: list[str] = []
    for key in ("clauses_contains_any", "clauses_contains_all"):
        value = condition.get(key)
        if isinstance(value, list):
            terms.extend(str(item) for item in value if item)
    value = condition.get("value")
    if condition.get("operator") in {"contains_any", "contains", "regex"}:
        if isinstance(value, list):
            terms.extend(str(item) for item in value if item)
        elif value:
            terms.append(str(value))
    return terms


def field_evidence_terms(condition: dict[str, Any]) -> list[str]:
    """Map field-based rules back to clause words without inventing quotes."""
    fields = " ".join(str(condition.get(key) or "") for key in ("field", "left", "right"))
    terms: list[str] = []
    if "actualReceivedAmount" in fields or "loanAmount" in fields:
        terms.extend(["实际到账", "实际收到", "借款本金", "扣除", "计息及还款本金"])
    if "prepaymentRule" in fields:
        terms.extend(["提前还款", "提前结清", "手续费", "申请", "批准"])
    if "overdueFee" in fields:
        terms.extend(["逾期", "违约金", "催收", "立即到期", "每日"])
    if "realAnnualRate" in fields or "nominalRate" in fields:
        terms.extend(["年利率", "年化", "名义利率", "费用", "服务费"])
    if "repaymentMethod" in fields:
        terms.extend(["还款方式", "每期应还", "还款日"])
    return terms


def score_clause(clause: dict[str, Any], rule: dict[str, Any], terms: list[str], preferred_categories: list[str]) -> int:
    text = clause.get("text", "") or ""
    category = clause.get("category")
    score = 0
    if category in preferred_categories:
        score += 2
    for term in terms:
        if term and term in text:
            score += 5
    for token in re.split(r"[-\s_/]+", rule["rule_name"]):
        if len(token) >= 2 and token in text:
            score += 3
    if re.search(r"人民币\s*[0-9,]+(?:\.\d+)?\s*元|[0-9]+(?:\.\d+)?%", text):
        score += 2
    if any(word in text for word in ["每月", "每期", "首期", "一次性", "扣除", "立即到期", "视为接受", "有效送达"]):
        score += 2
    if "未包含" in text and not re.search(r"人民币\s*[0-9,]+(?:\.\d+)?\s*元", text):
        score -= 2
    return score


def find_relevant_clauses(b_data: dict[str, Any], rule: dict[str, Any]) -> list[dict[str, Any]]:
    """Find B clauses that should become evidence for a rule hit.

    The function must never invent evidence. If no clause can be linked to the
    rule, the caller skips the risk item and records a warning in trace/output.
    """
    clauses = b_data.get("clauses", [])
    category = rule["category"]
    preferred_categories = RISK_CATEGORY_TO_CLAUSE_CATEGORY.get(category, [])
    terms = condition_terms(rule["condition"]) + field_evidence_terms(rule["condition"])
    scored = [
        (score_clause(clause, rule, terms, preferred_categories), clause)
        for clause in clauses
    ]
    matched = [clause for score, clause in sorted(scored, key=lambda item: item[0], reverse=True) if score >= 5]
    return matched[:3]


def evaluate_condition(condition: dict[str, Any], b_data: dict[str, Any]) -> bool:
    """Evaluate one JSON rule condition against B output data."""
    clauses_text = " ".join(clause.get("text", "") for clause in b_data.get("clauses", []))

    if "clauses_contains_any" in condition:
        if not contains_any(clauses_text, condition["clauses_contains_any"]):
            return False
    if "clauses_contains_all" in condition:
        if not contains_all(clauses_text, condition["clauses_contains_all"]):
            return False
    if "clauses_not_contains_any" in condition:
        if contains_any(clauses_text, condition["clauses_not_contains_any"]):
            return False
    if "field" in condition:
        value = get_path(b_data, condition["field"])
        operator = condition.get("operator")
        expected = condition.get("value")
        if operator == ">":
            return value is not None and value > expected
        if operator == ">=":
            return value is not None and value >= expected
        if operator == "<":
            return value is not None and value < expected
        if operator == "contains_any":
            return contains_any(str(value or ""), expected)
        if operator == "contains":
            return str(expected) in str(value or "")
        if operator == "regex":
            return re.search(str(expected), str(value or "")) is not None
    if "left" in condition and "right" in condition:
        left = get_path(b_data, condition["left"])
        right = get_path(b_data, condition["right"])
        operator = condition.get("operator")
        if left is None or right is None:
            return False
        if operator == "<":
            return left < right
        if operator == ">":
            if "delta" in condition:
                return left > right + condition["delta"]
            return left > right
        if operator == "==":
            return left == right

    return any(key.startswith("clauses_") for key in condition)


def keywords_for_rule(rule: dict[str, Any], b_data: dict[str, Any], clauses: list[dict[str, Any]]) -> list[str]:
    """Build retrieval keywords from rule, contract summary, and matched clauses."""
    summary = b_data.get("contractSummary", {})
    return [
        rule["rule_name"],
        rule["category"],
        rule.get("legal_basis") or "",
        rule.get("question_to_ask") or "",
        summary.get("productType") or "",
        summary.get("prepaymentRule") or "",
        summary.get("overdueFee") or "",
        " ".join(clause.get("text", "") for clause in clauses),
    ]


def build_reason(rule: dict[str, Any], regulations: list[dict[str, Any]]) -> str:
    """Create a concise, regulation-backed reason."""
    if regulations:
        basis = "；".join(item["title"] for item in regulations[:2])
        return f"命中规则“{rule['rule_name']}”。该判断参考 {basis}，规则依据为：{rule.get('legal_basis') or '知识库规则'}"
    return f"命中规则“{rule['rule_name']}”。规则依据为：{rule.get('legal_basis') or '知识库规则'}"


def possible_consequence(rule: dict[str, Any]) -> str:
    mapping = {
        "费用不透明": "用户可能低估真实借款成本，签约后发现总还款额高于预期。",
        "真实年化偏高": "实际融资成本可能明显高于宣传口径，长期还款压力增加。",
        "提前还款限制": "未来提前结清时，节省的利息可能被手续费或违约金抵消。",
        "砍头息": "名义本金与实际到手金额不一致，会推高真实年化成本。",
        "自动续费/扣款": "授权边界不清可能导致取消困难、重复扣款或扣款争议。",
        "担保责任不清": "用户可能在未充分理解的情况下承担额外担保或连带责任。",
        "逾期罚息过高": "一旦逾期，费用可能快速累积并影响征信。",
        "捆绑销售": "用户可能为非必要服务支付额外费用，且退费路径复杂。",
    }
    return mapping.get(rule["rule_name"], "该条款可能增加用户的资金、履约或维权成本。")


def question_to_ask(rule: dict[str, Any]) -> str:
    if rule.get("question_to_ask"):
        return rule["question_to_ask"]
    mapping = {
        "费用不透明": "请机构列明所有费用项目，并说明是否已计入明示年化利率。",
        "真实年化偏高": "请机构确认真实年化利率的计算口径，以及是否包含全部利息和费用。",
        "提前还款限制": "请机构说明提前结清时手续费如何计算，已收费用是否退还。",
        "砍头息": "请机构说明为什么实际到账金额低于合同本金，扣除费用是否有合法依据。",
        "自动续费/扣款": "请机构说明自动扣款授权的期限、范围、取消方式和扣款失败处理规则。",
        "担保责任不清": "请机构说明担保责任范围、期限、触发条件以及是否承担连带责任。",
        "逾期罚息过高": "请机构说明逾期罚息、违约金是否有上限，是否会重复计收。",
        "捆绑销售": "请机构说明相关保险或服务是否可自主选择，取消后是否影响贷款。",
    }
    return mapping.get(rule["rule_name"], "请机构用书面形式解释该条款的费用、责任和退出方式。")


def run_rule_engine(
    b_output: dict[str, Any],
    rules: list[dict[str, Any]],
    retriever: KnowledgeRetriever,
) -> tuple[list[RuleHit], int, list[SkippedRule]]:
    """Match rules, enrich hits through RAG, and compute the 0-100 risk score."""
    b_data = b_output["data"]
    hits: list[RuleHit] = []
    skipped_rules: list[SkippedRule] = []
    total_deduction = 0

    for rule in rules:
        if not evaluate_condition(rule["condition"], b_data):
            continue
        clauses = find_relevant_clauses(b_data, rule)
        if not clauses:
            skipped_rules.append(
                SkippedRule(
                    rule_id=rule["rule_id"],
                    rule_name=rule["rule_name"],
                    category=rule["category"],
                    reason="规则命中，但未能在 B 输出的 clauses 中找到可真实引用的相关条款，已跳过该风险项。",
                )
            )
            continue
        keywords = keywords_for_rule(rule, b_data, clauses)
        regulations = retriever.retrieve_regulations(keywords)
        query = " ".join(keywords)
        cases = retriever.retrieve_similar_cases(query, top_k=3)
        products = retriever.retrieve_products(query, top_k=3)
        market_rates = retriever.retrieve_market_rates("LPR_1Y", top_k=3)
        glossary_terms = retriever.retrieve_glossary_terms(query + " " + " ".join(clause.get("text", "") for clause in clauses))
        total_deduction += int(rule["weight"])
        hits.append(
            RuleHit(
                rule=rule,
                score_deduction=int(rule["weight"]),
                matched_clauses=clauses,
                regulations=regulations,
                cases=cases,
                products=products,
                market_rates=market_rates,
                glossary_terms=glossary_terms,
                reason=build_reason(rule, regulations),
            )
        )

    has_specific_cost_hit = any(
        hit.rule["category"] == "cost_transparency" and hit.rule["rule_id"] != "RR001"
        for hit in hits
    )
    if has_specific_cost_hit:
        generic_hits = [hit for hit in hits if hit.rule["rule_id"] == "RR001"]
        if generic_hits:
            total_deduction -= sum(int(hit.rule["weight"]) for hit in generic_hits)
            hits = [hit for hit in hits if hit.rule["rule_id"] != "RR001"]

    risk_score = max(0, 100 - total_deduction)
    return hits, risk_score, skipped_rules


def level_from_score(score: int) -> str:
    """Map product score to overall risk level: lower score means higher risk."""
    if score <= 40:
        return "high"
    if score <= 70:
        return "medium"
    return "low"
