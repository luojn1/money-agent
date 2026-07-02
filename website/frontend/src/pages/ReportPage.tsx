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
const confidence = (value: number) => `${Math.round(value * 100)}%`;

const feeTypeLabel: Record<string, string> = {
  service_fee: "服务费",
  management_fee: "管理费",
  consulting_fee: "咨询费",
  guarantee_fee: "担保/增信费",
  insurance_fee: "保险费",
  installment_fee: "分期手续费",
  prepayment_fee: "提前还款费用",
  overdue_penalty: "逾期费用",
  other: "其他费用",
};

const timingLabel: Record<string, string> = {
  upfront_deducted: "放款时扣除",
  upfront_paid: "签约/放款前支付",
  per_period: "每期收取",
  on_prepayment: "提前还款时",
  on_overdue: "逾期时",
  unknown: "合同未明确",
};

const costLevelLabel: Record<string, string> = {
  low: "成本较低",
  normal: "正常偏上",
  warning: "偏高预警",
  high: "高成本",
  insufficient_information: "信息不足",
};

const intakeMethodLabel: Record<string, string> = {
  demo: "示例合同",
  pasted_text: "粘贴文本",
  plain_text: "文本文件",
  docx_text: "Word 文档",
  pdf_text_layer: "PDF 文本层",
  image_ocr: "图片 OCR",
  unsupported_file: "暂不支持",
};

const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).slice(-1)[0] ?? path;

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

  const { contractSummary, costAnalysis, documentIntake } = result;
  const { contractParseResult } = result.bAgentOutput;
  const { knowledgeTraining } = costAnalysis;
  const visibleCashFlows = [
    ...costAnalysis.cashFlows.slice(0, 4),
    ...costAnalysis.cashFlows.slice(-2),
  ].filter((flow, index, flows) => flows.findIndex((item) => item.period === flow.period && item.amount === flow.amount) === index);
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
            <h1 id="report-title">已完成合同体检</h1>
            <p>{result.overallResult.summary}</p>
          </div>
          <div className="intro-summary" aria-label="报告摘要">
            <span>真实年化</span>
            <strong>{percent(costAnalysis.realAnnualRate)}</strong>
            <small>{costLevelLabel[costAnalysis.costLevel]}</small>
          </div>
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

        <section className="report-section intelligence-section" aria-labelledby="intelligence-title">
          <div className="report-section__heading">
            <span className="section-number">02</span>
            <div><h2 id="intelligence-title">识别链路与规则依据</h2><p>先确认合同文字从哪里来，再看测算规则是否有据可查。</p></div>
          </div>
          <div className="trace-grid">
            <article className="trace-card trace-card--intake">
              <div className="trace-card__top">
                <FileText size={24} weight="duotone" />
                <span>合同上传识别</span>
              </div>
              <strong>{intakeMethodLabel[documentIntake.method] ?? documentIntake.method}</strong>
              <p>{documentIntake.usedOcr ? "已尝试 OCR 识别图片文字" : "已从文件文本层或粘贴内容提取合同文字"}</p>
              <dl className="trace-facts">
                <div><dt>识别置信度</dt><dd>{confidence(documentIntake.confidence)}</dd></div>
                <div><dt>文本长度</dt><dd>{documentIntake.extractedTextLength.toLocaleString("zh-CN")} 字</dd></div>
              </dl>
              {documentIntake.warnings.length > 0 && (
                <div className="trace-warning">{documentIntake.warnings[0]}</div>
              )}
            </article>

            <article className="trace-card trace-card--knowledge">
              <div className="trace-card__top">
                <Calculator size={24} weight="duotone" />
                <span>知识库规则训练</span>
              </div>
              <strong>{knowledgeTraining.dictionaryTerms} 个识别词 · {knowledgeTraining.sourceFileCount} 份资料</strong>
              <p>费用归类、或有成本、LPR 阈值和现金流口径都来自本地知识库规则与原始资料。</p>
              <div className="knowledge-pills">
                <span>合同规则 {knowledgeTraining.contractEntryCount}</span>
                <span>产品规则 {knowledgeTraining.productEntryCount}</span>
                <span>来源目录 {knowledgeTraining.sourceCatalogCount}</span>
                <span>{basename(knowledgeTraining.rootDir)}</span>
              </div>
            </article>
          </div>
        </section>

        <section className="report-section cost-section" aria-labelledby="cost-title">
          <div className="report-section__heading">
            <span className="section-number">03</span>
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

        <section className="report-section b-agent-section" aria-labelledby="agent-title">
          <div className="report-section__heading">
            <span className="section-number">04</span>
            <div>
              <h2 id="agent-title">合同解析与真实成本</h2>
              <p>上传识别、字段抽取和成本测算串在一起；关键结论都保留依据，方便你逐项核对。</p>
            </div>
          </div>

          <div className="agent-board">
            <article className="agent-panel">
              <div className="agent-panel__header">
                <ClipboardText size={24} weight="duotone" />
                <div>
                  <h3>上传识别与字段解析</h3>
                  <p>{contractParseResult.needsManualReview ? "有些字段需要结合原文再次核对" : "主要金额、期限、还款和费用条款已识别"}</p>
                </div>
                <span className={contractParseResult.needsManualReview ? "agent-status agent-status--warn" : "agent-status agent-status--ok"}>
                  {contractParseResult.needsManualReview ? "需核对" : "已识别"}
                </span>
              </div>

              <div className="agent-field-grid">
                <div><span>识别方式</span><strong>{intakeMethodLabel[documentIntake.method] ?? documentIntake.method}</strong></div>
                <div><span>字段置信度</span><strong>{confidence(contractParseResult.institution.confidence)}</strong></div>
                <div><span>费用条目</span><strong>{contractParseResult.fees.length} 项</strong></div>
                <div><span>缺失字段</span><strong>{contractParseResult.missingFields.length ? contractParseResult.missingFields.join("、") : "无"}</strong></div>
              </div>

              <div className="agent-subblock">
                <h4>已识别费用</h4>
                <div className="fee-list">
                  {contractParseResult.fees.map((fee) => (
                    <div className="fee-item" key={`${fee.type}-${fee.location}-${fee.name}`}>
                      <div>
                        <strong>{fee.name}</strong>
                        <span>{feeTypeLabel[fee.type] ?? fee.type} · {timingLabel[fee.chargeTiming] ?? fee.chargeTiming}</span>
                      </div>
                      <div>
                        <strong>{fee.amount !== null ? money(fee.amount) : fee.rate !== null ? percent(fee.rate) : "原文判断"}</strong>
                        <span>{fee.includedInNormalCost ? "计入真实成本" : "或有成本"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="evidence-box">
                <span>识别文本片段</span>
                <p>{documentIntake.extractedTextPreview || contractParseResult.fees[0]?.evidenceText || contractParseResult.loanAmount.evidenceText || "暂无可展示原文"}</p>
              </div>
            </article>

            <article className="agent-panel agent-panel--cost">
              <div className="agent-panel__header">
                <Calculator size={24} weight="duotone" />
                <div>
                  <h3>真实成本测算</h3>
                  <p>按实际到账和每期还款生成现金流，并换算真实年化。</p>
                </div>
                <span className={`agent-status agent-status--${costAnalysis.costLevel === "high" ? "risk" : "ok"}`}>
                  {costLevelLabel[costAnalysis.costLevel]}
                </span>
              </div>

              <div className="agent-field-grid">
                <div><span>月度资金成本</span><strong>{costAnalysis.monthlyIrr === null ? "信息不足" : `${(costAnalysis.monthlyIrr * 100).toFixed(3)}%`}</strong></div>
                <div><span>复利年化</span><strong>{percent(costAnalysis.realAnnualRateCompound)}</strong></div>
                <div><span>费用占本金</span><strong>{percent(costAnalysis.feeRatio)}</strong></div>
                <div><span>知识库命中</span><strong>{knowledgeTraining.matchedProductEntries.length || "规则库"}</strong></div>
              </div>

              <div className="agent-subblock">
                <h4>现金流片段</h4>
                <div className="cashflow-list">
                  {visibleCashFlows.map((flow) => (
                    <div className="cashflow-item" key={`${flow.period}-${flow.amount}`}>
                      <span>第 {flow.period} 期</span>
                      <strong className={flow.amount >= 0 ? "cashflow-in" : "cashflow-out"}>
                        {flow.amount >= 0 ? "+" : "-"}{money(Math.abs(flow.amount))}
                      </strong>
                      <small>{flow.description}</small>
                    </div>
                  ))}
                </div>
              </div>

              <div className="basis-list">
                {knowledgeTraining.ruleSummary.map((basis) => <p key={basis}>{basis}</p>)}
                {costAnalysis.calculationBasis.slice(0, 4).map((basis) => <p key={basis}>{basis}</p>)}
              </div>
            </article>
          </div>
        </section>

        <section className="report-section" aria-labelledby="detail-title">
          <div className="report-section__heading">
            <span className="section-number">05</span>
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
            <span className="section-number">06</span>
            <div><h2 id="risk-title">风险条款</h2><p>点击每一项，查看原文、影响和建议追问。</p></div>
          </div>
          <div className="risk-list">
            {result.riskItems.map((item, index) => <RiskCard key={item.id} item={item} defaultExpanded={index === 0} />)}
          </div>
        </section>

        <section className="report-section questions-section" aria-labelledby="questions-title">
          <div className="report-section__heading">
            <span className="section-number">07</span>
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
