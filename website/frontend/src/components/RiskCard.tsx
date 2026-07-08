import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretUp } from "@phosphor-icons/react/CaretUp";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { useState } from "react";
import type { RiskLevel } from "../types/analysis";
import type { PipelineRiskItem } from "../types/pipeline";

type RiskItem = PipelineRiskItem & {
  mergedCount?: number;
  mergedRiskTitles?: string[];
};

const riskLabels: Record<RiskLevel, string> = {
  high: "高风险",
  medium: "需关注",
  low: "低风险",
};

type RiskCardProps = {
  item: RiskItem;
  defaultExpanded?: boolean;
};

export function RiskCard({ item, defaultExpanded = false }: RiskCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = `risk-${item.id}`;

  return (
    <article className={`risk-card risk-card--${item.riskLevel}`}>
      <button
        className="risk-card__summary"
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="risk-card__leading">
          <WarningCircle size={24} weight="fill" aria-hidden="true" />
          <span>
            <strong>{item.title}</strong>
            <small>
              {item.categoryLabel} · {item.clauseLocation ?? "合同条款"}
              {item.mergedCount && item.mergedCount > 1 ? ` · 已合并 ${item.mergedCount} 项相似风险` : ""}
            </small>
          </span>
        </span>
        <span className="risk-card__trailing">
          <span className={`risk-badge risk-badge--${item.riskLevel}`}>{riskLabels[item.riskLevel]}</span>
          {expanded ? <CaretUp size={20} /> : <CaretDown size={20} />}
        </span>
      </button>
      {expanded && (
        <div className="risk-card__details" id={contentId}>
          <div className="risk-detail-stack">
            <section>
              <h4>风险是什么</h4>
              <p>{item.possibleConsequence || item.title}</p>
              {item.mergedRiskTitles && item.mergedRiskTitles.length > 1 && (
                <small>合并展示：{item.mergedRiskTitles.slice(0, 3).join("、")}</small>
              )}
            </section>
            <section>
              <h4>为什么要关注</h4>
              <p>{item.reason}</p>
            </section>
            <section className="clause-quote">
              <h4>合同原文</h4>
              <blockquote>{item.clauseText}</blockquote>
            </section>
            <section>
              <h4>建议确认</h4>
              <p>{item.questionToAsk}</p>
            </section>
          </div>
        </div>
      )}
    </article>
  );
}
