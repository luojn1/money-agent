import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClipboardText } from "@phosphor-icons/react/ClipboardText";
import type { PipelineReport } from "../types/pipeline";
import {
  getCostHighlights,
  getOverallTone,
  getRiskKeyMetric,
  overallLevelLabel,
  riskLevelLabel,
  selectNextActions,
  selectTopRisks,
  shortenText,
} from "../utils/reportViewModel";
import { RiskCard } from "./RiskCard";

type ReportSummaryProps = {
  report: PipelineReport;
  onShowFull: () => void;
};

const priorityLabel = {
  must: "必须确认",
  should: "建议确认",
  optional: "可选确认",
} as const;

export function ReportSummary({ report, onShowFull }: ReportSummaryProps) {
  const allRisks = report.risks ?? [];
  const costHighlights = getCostHighlights(report);
  const topRisks = selectTopRisks(allRisks, 3);
  const nextActions = selectNextActions(report, 3);
  const overallTone = getOverallTone(report.actions.overallLevel);

  return (
    <div className="summary-stack" aria-label="摘要版报告">
      <section className={`summary-section summary-judgment summary-judgment--${overallTone}`} aria-labelledby="summary-judgment-title">
        <div>
          <span className="summary-section__kicker">总体判断</span>
          <h2 id="summary-judgment-title">{overallLevelLabel[report.actions.overallLevel]}</h2>
          <p>{shortenText(report.actions.summary, 140) || "请先核对合同成本、风险条款和机构书面说明。"}</p>
        </div>
        <dl className="summary-facts">
          <div>
            <dt>整体风险</dt>
            <dd>{topRisks[0] ? riskLevelLabel[topRisks[0].riskLevel] : "暂无明显风险"}</dd>
          </div>
          <div>
            <dt>报告状态</dt>
            <dd>{report.status === "completed" ? "已完成" : "需核对"}</dd>
          </div>
        </dl>
      </section>

      {costHighlights.length > 0 && (
        <section className="summary-section" aria-labelledby="summary-cost-title">
          <div className="summary-section__heading">
            <span className="summary-section__kicker">核心成本</span>
            <h2 id="summary-cost-title">先看最影响决策的数字</h2>
          </div>
          <div className="summary-cost-grid">
            {costHighlights.map((item) => (
              <article className={`summary-cost-item${item.emphasis ? " summary-cost-item--emphasis" : ""}`} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                {item.helper && <small>{item.helper}</small>}
              </article>
            ))}
          </div>
        </section>
      )}

      {topRisks.length > 0 && (
        <section className="summary-section" aria-labelledby="summary-risks-title">
          <div className="summary-section__heading">
            <span className="summary-section__kicker">重点风险</span>
            <h2 id="summary-risks-title">默认只看最需要先处理的 {topRisks.length} 项</h2>
          </div>
          <div className="risk-list risk-list--summary">
            {topRisks.map((item) => (
              <RiskCard key={item.id} item={item} variant="summary" keyMetric={getRiskKeyMetric(item, report)} />
            ))}
          </div>
          {allRisks.length > topRisks.length && (
            <p className="summary-more-note">完整版中还保留 {allRisks.length - topRisks.length} 项风险和对应依据。</p>
          )}
        </section>
      )}

      {nextActions.length > 0 && (
        <section className="summary-section" aria-labelledby="summary-actions-title">
          <div className="summary-section__heading">
            <span className="summary-section__kicker">下一步行动</span>
            <h2 id="summary-actions-title">优先完成这些确认</h2>
          </div>
          <ol className="summary-action-list">
            {nextActions.map((action) => (
              <li key={action.id}>
                <CheckCircle size={21} weight="duotone" aria-hidden="true" />
                <div>
                  <span>{priorityLabel[action.priority]}</span>
                  <p>{shortenText(action.label, 96)}</p>
                  {action.detail && <small>{shortenText(action.detail, 92)}</small>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="summary-full-entry">
        <div>
          <strong>需要核对证据、条款和完整计算过程？</strong>
          <span>完整版保留全部费用、风险分组、参考依据和行动建议。</span>
        </div>
        <button className="secondary-button" type="button" onClick={onShowFull}>
          <ClipboardText size={18} weight="duotone" aria-hidden="true" />
          查看完整版
          <ArrowRight size={17} weight="bold" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
