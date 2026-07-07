import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { Bank } from "@phosphor-icons/react/Bank";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { Calculator } from "@phosphor-icons/react/Calculator";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClipboardText } from "@phosphor-icons/react/ClipboardText";
import { Coins } from "@phosphor-icons/react/Coins";
import { CurrencyCny } from "@phosphor-icons/react/CurrencyCny";
import { FileText } from "@phosphor-icons/react/FileText";
import { HandCoins } from "@phosphor-icons/react/HandCoins";
import { Percent } from "@phosphor-icons/react/Percent";
import { Question } from "@phosphor-icons/react/Question";
import { Receipt } from "@phosphor-icons/react/Receipt";
import { SealWarning } from "@phosphor-icons/react/SealWarning";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { Wallet } from "@phosphor-icons/react/Wallet";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MetricCard } from "../components/MetricCard";
import { PageShell } from "../components/PageShell";
import { RiskCard } from "../components/RiskCard";
import { api } from "../services/api";
import type { ActionItem, PipelineReport } from "../types/pipeline";

const money = (value: number | null) => value === null ? "信息不足" : `${value.toLocaleString("zh-CN")} 元`;
const percent = (value: number | null) => value === null ? "信息不足" : `${value.toFixed(1)}%`;

const costLevelLabel: Record<string, string> = {
  low: "成本较低",
  normal: "正常偏上",
  warning: "偏高预警",
  high: "成本偏高",
  insufficient_information: "信息不足",
};

const priorityLabel: Record<ActionItem["priority"], string> = {
  must: "必须确认",
  should: "建议确认",
  optional: "可选优化",
};

export function ReportPage() {
  const { taskId = "mock_bcd_demo" } = useParams();
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    api.getAnalysisResult(taskId)
      .then((data) => {
        if (!disposed) {
          setReport(data);
          setError("");
        }
      })
      .catch((requestError: unknown) => {
        if (!disposed) setError(requestError instanceof Error ? requestError.message : "报告暂时无法加载。");
      });
    return () => { disposed = true; };
  }, [retryKey, taskId]);

  const costRows = useMemo(() => {
    if (!report) return [];
    return [
      { label: "合同本金", value: report.overview.loanAmount, className: "principal" },
      { label: "总利息", value: report.costAnalysis.totalInterest, className: "interest" },
      { label: "额外费用", value: report.costAnalysis.additionalFees, className: "fees" },
    ];
  }, [report]);

  if (!report && !error) {
    return (
      <PageShell compactHeader>
        <main className="state-page"><span className="loading-ring" /><h1>正在整理合同体检报告…</h1></main>
      </PageShell>
    );
  }

  if (error || !report) {
    return (
      <PageShell compactHeader>
        <main className="state-page">
          <SealWarning size={44} weight="duotone" />
          <h1>报告暂时没能打开</h1>
          <p>{error || "请稍后重试。"}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setError("");
              setRetryKey((value) => value + 1);
            }}
          >
            重新加载
          </button>
          <Link className="back-link" to="/">返回上传页</Link>
        </main>
      </PageShell>
    );
  }

  const maxCost = Math.max(...costRows.map((row) => row.value ?? 0), 1);
  const overviewDetails = [
    ["金融机构", report.overview.institution, Bank],
    ["产品类型", report.overview.productType, ClipboardText],
    ["借款金额", money(report.overview.loanAmount), CurrencyCny],
    ["实际到账金额", money(report.overview.actualReceivedAmount), Wallet],
    ["期限", report.overview.termMonths ? `${report.overview.termMonths} 个月` : null, CalendarBlank],
    ["分期期数", report.overview.installmentCount ? `${report.overview.installmentCount} 期` : null, Receipt],
    ["月供", money(report.overview.monthlyPayment), HandCoins],
    ["名义利率", percent(report.overview.nominalAnnualRate), Percent],
  ] as const;

  const actionGroups = [
    { title: "必须确认事项", items: report.actions.mustConfirm },
    { title: "建议确认事项", items: report.actions.shouldConfirm },
    { title: "可选优化事项", items: report.actions.optionalOptimizations },
  ];

  return (
    <PageShell compactHeader>
      <main className="report-page">
        <div className="report-toolbar">
          <Link className="back-link" to="/"><ArrowLeft size={18} />重新分析一份合同</Link>
          <span>报告编号：{report.taskId}</span>
        </div>

        <section className="report-intro" aria-labelledby="report-title">
          <div>
            <p className="eyebrow">完整分析报告</p>
            <h1 id="report-title">合同体检结果</h1>
            <p>{report.actions.summary}</p>
          </div>
          <div className="intro-summary" aria-label="真实年化">
            <span>真实年化</span>
            <strong>{percent(report.overview.realAnnualRate)}</strong>
            <small>{costLevelLabel[report.costAnalysis.costLevel]}</small>
          </div>
        </section>

        <section className="report-section metrics-section" aria-labelledby="overview-title">
          <div className="report-section__heading">
            <span className="section-number">A</span>
            <div><h2 id="overview-title">合同概览</h2><p>先核对合同主体、金额、期限、月供和利率口径。</p></div>
          </div>
          <div className="metric-grid">
            <MetricCard label="借款金额" value={money(report.overview.loanAmount)} icon={CurrencyCny} />
            <MetricCard label="实际到账" value={money(report.overview.actualReceivedAmount)} icon={Wallet} />
            <MetricCard label="月供" value={money(report.overview.monthlyPayment)} icon={Receipt} />
            <MetricCard label="真实年化" value={percent(report.overview.realAnnualRate)} icon={Percent} emphasis />
          </div>
          <dl className="detail-grid detail-grid--compact">
            {overviewDetails.map(([label, value, IconComponent]) => (
              <div key={label}>
                <dt><IconComponent size={18} weight="duotone" />{label}</dt>
                <dd>{value ?? "信息不足"}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="report-section cost-section" aria-labelledby="cost-title">
          <div className="report-section__heading">
            <span className="section-number">B</span>
            <div><h2 id="cost-title">成本分析</h2><p>把本金、利息、服务费和真实年化放在同一口径核对。</p></div>
          </div>
          <div className="metric-grid metric-grid--three">
            <MetricCard label="总还款额" value={money(report.costAnalysis.totalRepayment)} icon={Receipt} />
            <MetricCard label="总利息" value={money(report.costAnalysis.totalInterest)} icon={Coins} />
            <MetricCard label="额外费用" value={money(report.costAnalysis.additionalFees)} icon={Calculator} emphasis />
          </div>
          <div className="cost-insight-grid">
            <div><span>实际到账与合同本金差额</span><strong>{money(report.costAnalysis.principalGap)}</strong></div>
            <div><span>名义利率与真实年化差异</span><strong>{percent(report.costAnalysis.rateGap)}</strong></div>
            <div><span>成本风险等级</span><strong>{costLevelLabel[report.costAnalysis.costLevel]}</strong></div>
          </div>
          <div className="cost-chart" role="img" aria-label="合同本金、利息和额外费用对比">
            {costRows.map((row) => (
              <div className="cost-row" key={row.label}>
                <div className="cost-row__label"><span>{row.label}</span><strong>{money(row.value)}</strong></div>
                <div className="cost-bar"><span className={`cost-bar__fill cost-bar__fill--${row.className}`} style={{ width: `${Math.max(6, ((row.value ?? 0) / maxCost) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="basis-list">
            {report.costAnalysis.calculationBasis.map((basis) => <p key={basis}>{basis}</p>)}
          </div>
        </section>

        <section className="report-section" aria-labelledby="risk-title">
          <div className="report-section__heading">
            <span className="section-number">C</span>
            <div><h2 id="risk-title">风险识别</h2><p>每项风险都保留风险等级、类别、条款、原因、后果和建议确认问题。</p></div>
          </div>
          <div className="risk-list">
            {report.risks.map((item, index) => <RiskCard key={item.id} item={item} defaultExpanded={index === 0} />)}
          </div>
        </section>

        <section className="report-section references-section" aria-labelledby="references-title">
          <div className="report-section__heading">
            <span className="section-number">D</span>
            <div><h2 id="references-title">案例和依据</h2><p>演示数据只展示典型情景和规则口径，不包装成真实判例来源。</p></div>
          </div>
          <div className="reference-list">
            {report.references.map((group) => (
              <details key={group.id} className="reference-group" open>
                <summary>{group.title}<span>{group.items.length} 项</span></summary>
                <div className="reference-items">
                  {group.items.map((item) => (
                    <article key={item.id} className="reference-item">
                      <span>{item.tag}</span>
                      <strong>{item.title}</strong>
                      <p>{item.summary}</p>
                      {item.sourceUrl && <a href={item.sourceUrl}>{item.sourceLabel ?? "查看来源"}</a>}
                    </article>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="report-section actions-section" aria-labelledby="actions-title">
          <div className="report-section__heading">
            <span className="section-number">E</span>
            <div><h2 id="actions-title">建议与行动</h2><p>按签约前、还款期间、提前还款前、逾期和争议阶段整理。</p></div>
          </div>

          <article className="conclusion-box">
            <ShieldCheck size={24} weight="duotone" />
            <div>
              <span>综合结论</span>
              <p>{report.actions.summary}</p>
            </div>
          </article>

          <div className="action-group-grid">
            {actionGroups.map((group) => (
              <article className="action-group" key={group.title}>
                <h3>{group.title}</h3>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                      <small>{priorityLabel[item.priority]} · 关联风险：{item.relatedRiskIds.join("、")}</small>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="report-subsection-grid">
            <article>
              <h3><Question size={20} weight="duotone" />问题清单</h3>
              <ol className="question-list question-list--single">
                {report.actions.questionList.map((question) => (
                  <li key={question}><span><CheckCircle size={21} weight="duotone" /></span><p>{question}</p></li>
                ))}
              </ol>
            </article>
            <article>
              <h3><FileText size={20} weight="duotone" />证据保存清单</h3>
              <ul className="plain-check-list">
                {report.actions.evidenceChecklist.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          </div>

          <article className="script-box">
            <h3>沟通话术</h3>
            {report.actions.communicationScripts.map((script) => <p key={script}>{script}</p>)}
          </article>

          <div className="timeline-plan">
            {report.actions.actionPlan.map((section) => (
              <article key={section.stage}>
                <h3>{section.title}</h3>
                {section.items.map((item) => (
                  <div key={item.id}>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </section>

        {report.warnings.length > 0 && (
          <footer className="report-disclaimer">
            <Calculator size={22} weight="duotone" />
            <p><strong>提示</strong>{report.warnings.join(" ")}</p>
          </footer>
        )}
      </main>
    </PageShell>
  );
}
