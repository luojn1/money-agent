import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretUp } from "@phosphor-icons/react/CaretUp";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { useState } from "react";
import type { RiskLevel } from "../types/analysis";
import type { PipelineRiskItem } from "../types/pipeline";
import { resolveLegalReferences } from "../utils/legalReferences";
import { cleanUserFacingText } from "../utils/userFacingText";

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
  const displayTitle = cleanUserFacingText(item.title, "需要确认的风险");
  const displayCategory = cleanUserFacingText(item.categoryLabel, "合同条款");
  const displayLocation = cleanUserFacingText(item.clauseLocation ?? "", "页码 / 段落待核对");
  const displayConsequence = cleanUserFacingText(item.possibleConsequence, displayTitle);
  const displayReason = cleanUserFacingText(
    item.reason,
    "请结合合同原文确认该条款对费用、还款或权利义务的影响。",
  );
  const explanation = [displayConsequence, displayReason]
    .filter((text, index, list) => text && list.findIndex((itemText) => itemText === text) === index)
    .map((text) => /[。！？]$/.test(text) ? text : `${text}。`)
    .join("");
  const mergedRiskTitles = (item.mergedRiskTitles ?? [])
    .map((title) => cleanUserFacingText(title, ""))
    .filter(Boolean);
  const legalReferences = resolveLegalReferences(item);

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
            <strong>{displayTitle}</strong>
            <small>{displayCategory}</small>
            <small>{displayLocation}</small>
            {item.mergedCount && item.mergedCount > 1 ? <small>已合并 {item.mergedCount} 项相似风险</small> : null}
          </span>
        </span>
        <span className="risk-card__trailing">
          <span className={`risk-badge risk-badge--${item.riskLevel}`}>{riskLabels[item.riskLevel]}</span>
          <span className="risk-card__toggle">{expanded ? "收起" : "展开"}</span>
          {expanded ? <CaretUp size={20} /> : <CaretDown size={20} />}
        </span>
      </button>
      {expanded && (
        <div className="risk-card__details" id={contentId}>
          <div className="risk-detail-stack">
            <section className="clause-quote">
              <div className="clause-quote__header">
                <h4>合同原文摘录</h4>
                <small>{displayLocation}</small>
              </div>
              <blockquote>{item.clauseText}</blockquote>
              {mergedRiskTitles.length > 1 && (
                <small>合并展示：{mergedRiskTitles.slice(0, 3).join("、")}</small>
              )}
            </section>
            <section>
              <h4>风险说明</h4>
              <p>{explanation}</p>
              <small>对应处理建议已整理至下方“建议行动”板块。</small>
            </section>
            <details className="legal-reference-panel">
              <summary>查看参考依据</summary>
              <div className="legal-reference-list">
                {legalReferences.length > 0 ? legalReferences.map((reference) => (
                  <article key={`${reference.lawName}-${reference.articleNumber ?? reference.articleTitle ?? reference.fullText}`}>
                    <strong>
                      {reference.lawName}
                      {reference.articleNumber ? ` ${reference.articleNumber}` : ""}
                    </strong>
                    {reference.articleTitle && <span>{reference.articleTitle}</span>}
                    <p>{reference.fullText}</p>
                    <small>{reference.relevance}</small>
                    <small>{reference.sourceNote}</small>
                  </article>
                )) : (
                  <article>
                    <strong>参考依据</strong>
                    <p>暂未识别到明确参考依据。请以合同原文和官方法律文本为准。</p>
                  </article>
                )}
              </div>
            </details>
          </div>
        </div>
      )}
    </article>
  );
}
