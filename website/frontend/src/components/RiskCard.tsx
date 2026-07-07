import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretUp } from "@phosphor-icons/react/CaretUp";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { useState } from "react";
import type { RiskLevel } from "../types/analysis";
import type { PipelineRiskItem } from "../types/pipeline";

type RiskItem = PipelineRiskItem;

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
            <small>{item.categoryLabel} · {item.clauseLocation ?? "合同条款"}</small>
          </span>
        </span>
        <span className="risk-card__trailing">
          <span className={`risk-badge risk-badge--${item.riskLevel}`}>{riskLabels[item.riskLevel]}</span>
          {expanded ? <CaretUp size={20} /> : <CaretDown size={20} />}
        </span>
      </button>
      {expanded && (
        <div className="risk-card__details" id={contentId}>
          <div className="clause-quote">
            <span>合同原文</span>
            <blockquote>{item.clauseText}</blockquote>
          </div>
          <dl className="risk-explanation-grid">
            <div>
              <dt>风险类别</dt>
              <dd>
                {item.categoryLabel}
                {item.confidence !== null && item.confidence !== undefined ? ` · 置信度 ${Math.round(item.confidence * 100)}%` : ""}
                <br />
                条款 ID：{item.relatedClauseIds.join("、")}
              </dd>
            </div>
            <div>
              <dt>判断原因</dt>
              <dd>{item.reason}</dd>
            </div>
            <div>
              <dt>可能后果</dt>
              <dd>{item.possibleConsequence}</dd>
            </div>
            <div>
              <dt>建议确认</dt>
              <dd>{item.questionToAsk}</dd>
            </div>
          </dl>
        </div>
      )}
    </article>
  );
}
