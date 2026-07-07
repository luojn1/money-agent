"""RAG retrieval for cases and regulations."""

from __future__ import annotations

from typing import Any

from db.dao import load_cases, load_financial_glossary, load_financial_products, load_market_rates, load_regulations
from rag.embeddings import cosine_similarity, text_vector


class KnowledgeRetriever:
    """Retrieve relevant regulations and cases from the SQLite knowledge base."""

    def __init__(self, connection):
        self.connection = connection
        self._cases = load_cases(connection)
        self._regulations = load_regulations(connection)
        self._products = load_financial_products(connection)
        self._market_rates = load_market_rates(connection)
        self._glossary = load_financial_glossary(connection)
        self._case_vectors = [(case, text_vector(self._case_corpus(case))) for case in self._cases]
        self._regulation_vectors = [(regulation, text_vector(self._regulation_corpus(regulation))) for regulation in self._regulations]
        self._product_vectors = [(product, text_vector(self._product_corpus(product))) for product in self._products]

    @staticmethod
    def _case_corpus(case: dict[str, Any]) -> str:
        return " ".join(
            [
                case.get("title") or "",
                case.get("scenario") or "",
                case.get("risk_type") or "",
                case.get("description") or "",
                case.get("dispute_point") or "",
                case.get("user_loss") or "",
            ]
        )

    @staticmethod
    def _regulation_corpus(regulation: dict[str, Any]) -> str:
        return " ".join(
            [
                regulation.get("title") or "",
                regulation.get("summary") or "",
                regulation.get("full_text") or "",
                regulation.get("keywords") or "",
                regulation.get("applicable_scenarios") or "",
            ]
        )

    @staticmethod
    def _product_corpus(product: dict[str, Any]) -> str:
        return " ".join(
            [
                product.get("product_name") or "",
                product.get("product_type") or "",
                product.get("institution") or "",
                product.get("typical_rate_range") or "",
                product.get("common_fees") or "",
                product.get("prepayment_policy") or "",
                product.get("overdue_policy") or "",
            ]
        )

    def retrieve_similar_cases(self, query: str, top_k: int = 3) -> list[dict[str, Any]]:
        """Return the most similar dispute/fraud cases for a risk description."""
        query_vector = text_vector(query)
        scored: list[tuple[float, dict[str, Any]]] = []
        for case, case_vector in self._case_vectors:
            score = cosine_similarity(query_vector, case_vector)
            scored.append((score, case))

        scored.sort(key=lambda item: item[0], reverse=True)
        results = []
        for score, case in scored[:top_k]:
            if score <= 0:
                continue
            results.append(
                {
                    "caseId": case["case_id"],
                    "title": case["title"],
                    "similarity": round(score, 4),
                    "conclusion": f"{case['dispute_point']}；处理结果：{case['handling_result']}",
                    "sourceUrl": case["source_url"],
                }
            )
        return results

    def retrieve_regulations(self, keywords: list[str], top_k: int = 3) -> list[dict[str, Any]]:
        """Retrieve regulations by keyword overlap and semantic text similarity."""
        query = " ".join(keywords)
        query_vector = text_vector(query)
        scored: list[tuple[float, dict[str, Any]]] = []
        for regulation, regulation_vector in self._regulation_vectors:
            corpus = self._regulation_corpus(regulation)
            score = cosine_similarity(query_vector, regulation_vector)
            keyword_bonus = sum(1 for keyword in keywords if keyword and keyword in corpus) * 0.08
            scored.append((score + keyword_bonus, regulation))

        scored.sort(key=lambda item: item[0], reverse=True)
        return [
            {
                "regulationId": regulation["regulation_id"],
                "title": regulation["title"],
                "summary": regulation["summary"],
                "sourceUrl": regulation["source_url"],
                "score": round(score, 4),
            }
            for score, regulation in scored[:top_k]
            if score > 0
        ]

    def retrieve_products(self, query: str, top_k: int = 3) -> list[dict[str, Any]]:
        """Retrieve comparable financial products by product type and text similarity."""
        query_vector = text_vector(query)
        scored: list[tuple[float, dict[str, Any]]] = []
        for product, product_vector in self._product_vectors:
            score = cosine_similarity(query_vector, product_vector)
            scored.append((score, product))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [
            {
                "productId": product["product_id"],
                "productName": product["product_name"],
                "productType": product["product_type"],
                "institution": product["institution"],
                "typicalRateRange": product["typical_rate_range"],
                "commonFees": product["common_fees"],
                "prepaymentPolicy": product["prepayment_policy"],
                "overduePolicy": product["overdue_policy"],
                "similarity": round(score, 4),
            }
            for score, product in scored[:top_k]
            if score > 0
        ]

    def retrieve_market_rates(self, rate_type: str = "LPR_1Y", top_k: int = 3) -> list[dict[str, Any]]:
        """Return latest market benchmark rates such as LPR."""
        rows = [row for row in self._market_rates if row.get("rate_type") == rate_type]
        return [
            {
                "rateId": row["rate_id"],
                "rateType": row["rate_type"],
                "rateValue": row["rate_value"],
                "effectiveDate": row["effective_date"],
                "source": row["source"],
            }
            for row in rows[:top_k]
        ]

    def retrieve_glossary_terms(self, text: str, limit: int = 8) -> list[dict[str, Any]]:
        """Return plain-language explanations for finance terms found in text."""
        found = []
        for term in self._glossary:
            keyword = term.get("term") or ""
            if keyword and keyword in text:
                found.append(
                    {
                        "termId": term["term_id"],
                        "term": term["term"],
                        "definition": term["definition"],
                        "category": term["category"],
                        "example": term["example"],
                    }
                )
            if len(found) >= limit:
                break
        return found


def retrieve_similar_cases(connection, query: str, top_k: int = 3) -> list[dict[str, Any]]:
    """Functional wrapper required by the assignment."""
    return KnowledgeRetriever(connection).retrieve_similar_cases(query, top_k)


def retrieve_regulations(connection, keywords: list[str]) -> list[dict[str, Any]]:
    """Functional wrapper required by the assignment."""
    return KnowledgeRetriever(connection).retrieve_regulations(keywords)


def retrieve_products(connection, query: str, top_k: int = 3) -> list[dict[str, Any]]:
    return KnowledgeRetriever(connection).retrieve_products(query, top_k)


def retrieve_market_rates(connection, rate_type: str = "LPR_1Y", top_k: int = 3) -> list[dict[str, Any]]:
    return KnowledgeRetriever(connection).retrieve_market_rates(rate_type, top_k)


def retrieve_glossary_terms(connection, text: str, limit: int = 8) -> list[dict[str, Any]]:
    return KnowledgeRetriever(connection).retrieve_glossary_terms(text, limit)

