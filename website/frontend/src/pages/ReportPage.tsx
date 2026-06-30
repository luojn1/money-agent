import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { Bank } from "@phosphor-icons/react/Bank";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { Calculator } from "@phosphor-icons/react/Calculator";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClipboardText } from "@phosphor-icons/react/ClipboardText";
import { Coins } from "@phosphor-icons/react/Coins";
import { CurrencyCny } from "@phosphor-icons/react/CurrencyCny";
import { HandCoins } from "@phosphor-icons/react/HandCoins";
import { Percent } from "@phosphor-icons/react/Percent";
import { Receipt } from "@phosphor-icons/react/Receipt";
import { SealWarning } from "@phosphor-icons/react/SealWarning";
import { Wallet } from "@phosphor-icons/react/Wallet";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MetricCard } from "../components/MetricCard";
import { PageShell } from "../components/PageShell";
import { RiskCard } from "../components/RiskCard";
import { api } from "../services/api";
import type { AnalysisResult } from "../types/analysis";

const money = (value: number | null) => value === null ? "信息不足" : `${value.toLocaleString("zh-CN")}元`;
const percent = (value: number | null) => value === null ? "信息不足" : `${value.toFixed(1)}%`;

export function ReportPage() {
  const { taskId = "demo_001" } = useParams();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    api.getAnalysisResult(taskId)
      .then((data) => {
        if (!disposed) setResult(data);
      })
      .catch((requestError: unknown) => {
        if (!disposed) setError(requestError instanceof Error ? requestError.message : "报告暂时无法加载。");
      });
    return () => { disposed = true; };
  }, [retryKey, taskId]);

  const extraCost = useMemo(() => {
    if (!result) return null;
    const { totalRepayment } = result.costAnalysis;
    const { actualReceivedAmount } = result.contractSummary;
    return totalRepayment !== null && actualReceivedAmount !== null ? totalRepayment - actualReceivedAmount : null;
  }, [result]);

  if (!result && !error) {
    return (
      <PageShell compactHeader>
        <main className="state-page"><span className="loading-ring" /><h1>正在整理合同体检报告…</h1></main>
      </PageShell>
    );
  }

  if (error || !result) {
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

  const { contractSummary, costAnalysis } = result;
  const costRows = [
    { label: "借款本金", value: contractSummary.loanAmount ?? 0, className: "principal" },
    { label: "利息", value: costAnalysis.totalInterest ?? 0, className: "interest" },
    { label: "服务费及其他费用", value: costAnalysis.additionalFees ?? 0, className: "fees" },
  ];
  const maxCost = Math.max(...costRows.map((row) => row.value), 1);
  const details = [
    ["借款机构", contractSummary.institution, Bank],
    ["合同类型", contractSummary.productType, ClipboardText],
    ["借款金额", money(contractSummary.loanAmount), CurrencyCny],
    ["实际到账金额", money(contractSummary.actualReceivedAmount), Wallet],
    ["合同期限", contractSummary.loanTermMonths ? `${contractSummary.loanTermMonths}个月` : null, CalendarBlank],
    ["每期还款", money(contractSummary.monthlyPayment), Receipt],
    ["还款方式", contractSummary.repaymentMethod, HandCoins],
    ["名义费率", percent(contractSummary.nominalRate), Percent],
    ["提前还款规则", contractSummary.prepaymentRule, Coins],
    ["逾期费用", contractSummary.overdueFee, SealWarning],
  ] as const;

  return (
    <PageShell compactHeader>
      <main className="report-page">
        <div className="report-toolbar">
          <Link className="back-link" to="/"><ArrowLeft size={18} />重新分析一份合同</Link>
          <span>报告编号：{result.taskId}</span>
        </div>

        <section className="report-intro" aria-labelledby="report-title">
          <div>
            <p className="eyebrow">合同体检报告</p>
            <h1 id="report-title">建议重点核实</h1>
            <p>{result.overallResult.summary}</p>
          </div>
          <div className="report-verdict-icon" aria-hidden="true"><SealWarning size={42} weight="duotone" /></div>
        </section>

        <section className="report-section metrics-section" aria-labelledby="metrics-title">
          <div className="report-section__heading">
            <span className="section-number">01</span>
            <div><h2 id="metrics-title">四个核心数字</h2><p>先看你最终拿到多少、总共要还多少。</p></div>
          </div>
          <div className="metric-grid">
            <MetricCard label="实际到账金额" value={money(contractSummary.actualReceivedAmount)} icon={Wallet} />
            <MetricCard label="总还款金额" value={money(costAnalysis.totalRepayment)} icon={Receipt} />
            <MetricCard label="额外支付成本" value={money(extraCost)} icon={Coins} emphasis />
            <MetricCard label="真实年化利率" value={percent(costAnalysis.realAnnualRate)} icon={Percent} emphasis />
          </div>
        </section>

        <section className="report-section cost-section" aria-labelledby="cost-title">
          <div className="report-section__heading">
            <span className="section-number">02</span>
            <div><h2 id="cost-title">成本构成</h2><p>服务费虽然不叫利息，也会增加你的实际成本。</p></div>
          </div>
          <div className="cost-chart" role="img" aria-label="本金、利息和服务费成本对比">
            {costRows.map((row) => (
              <div className="cost-row" key={row.label}>
                <div className="cost-row__label"><span>{row.label}</span><strong>{money(row.value)}</strong></div>
                <div className="cost-bar"><span className={`cost-bar__fill cost-bar__fill--${row.className}`} style={{ width: `${Math.max(6, (row.value / maxCost) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="report-section" aria-labelledby="detail-title">
          <div className="report-section__heading">
            <span className="section-number">03</span>
            <div><h2 id="detail-title">合同关键信息</h2><p>把分散在合同里的信息放在一处核对。</p></div>
          </div>
          <dl className="detail-grid">
            {details.map(([label, value, IconComponent]) => (
              <div key={label} className={label.length > 6 ? "detail-item--wide" : ""}>
                <dt><IconComponent size={18} weight="duotone" />{label}</dt>
                <dd>{value ?? "信息不足"}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="report-section" aria-labelledby="risk-title">
          <div className="report-section__heading">
            <span className="section-number">04</span>
            <div><h2 id="risk-title">风险条款</h2><p>点击每一项，查看原文、影响和建议追问。</p></div>
          </div>
          <div className="risk-list">
            {result.riskItems.map((item, index) => <RiskCard key={item.id} item={item} defaultExpanded={index === 0} />)}
          </div>
        </section>

        <section className="report-section questions-section" aria-labelledby="questions-title">
          <div className="report-section__heading">
            <span className="section-number">05</span>
            <div><h2 id="questions-title">签约前问题清单</h2><p>带着这些问题去确认，答案要尽量留在书面材料里。</p></div>
          </div>
          <ol className="question-list">
            {result.questionList.map((question) => (
              <li key={question}><span><CheckCircle size={21} weight="duotone" /></span><p>{question}</p></li>
            ))}
          </ol>
        </section>

        <footer className="report-disclaimer">
          <Calculator size={22} weight="duotone" />
          <p><strong>免责声明</strong>本报告仅用于帮助理解合同和识别信息风险，不构成法律、投资或信贷决策意见。</p>
        </footer>
      </main>
    </PageShell>
  );
}
