const DEFAULT_B_DATA = {
  schemaVersion: "1.0.0",
  taskId: "task_20260702_001",
  contractId: "contract_001",
  runId: "run_b_001",
  agent: "contract_cost",
  status: "completed",
  data: {
    contract: { contractName: "示例消费贷合同.pdf", pageCount: 12, fileSha256: null },
    contractSummary: {
      institution: "安心消费金融有限公司",
      productType: "个人消费贷款",
      loanAmount: 10000,
      actualReceivedAmount: 9500,
      loanTermMonths: 12,
      installmentCount: 12,
      monthlyPayment: 940,
      repaymentMethod: "按月等额还款",
      nominalRate: 12.8,
      prepaymentRule: "提前结清需支付剩余本金 2% 的手续费",
      overdueFee: "逾期罚息为正常利率的 1.5 倍，并可能收取违约金"
    },
    clauses: [
      {
        clauseId: "clause_fee_003",
        category: "fee",
        heading: "费用说明 第 3 条",
        text: "贷款发放时，平台服务费人民币 500 元由放款金额中一次性扣除。",
        location: { page: 4, section: "费用说明 第 3 条", paragraph: 1 }
      },
      {
        clauseId: "clause_prepay_008",
        category: "prepayment",
        heading: "还款约定 第 8 条",
        text: "借款人申请提前结清，应按剩余未还本金的 2% 支付提前结清手续费。",
        location: { page: 7, section: "还款约定 第 8 条", paragraph: 2 }
      }
    ],
    repaymentSchedule: [],
    costAnalysis: {
      totalRepayment: 11280,
      totalInterest: 1280,
      additionalFees: 500,
      realAnnualRate: 23.4,
      calculationBasis: ["实际到账金额为 9500 元", "按 12 期、每期 940 元的现金流估算真实年化成本"]
    }
  },
  warnings: [],
  errors: []
};

const DEFAULT_C_DATA = {
  schemaVersion: "1.0.0",
  taskId: "task_20260702_001",
  contractId: "contract_001",
  runId: "run_risk_case_task_20260702_001",
  agent: "risk_case",
  agentVersion: "c-0.2.0-dynamic-kb",
  status: "completed",
  generatedAt: "2026-07-04T17:05:57+08:00",
  inputRunIds: ["run_b_001"],
  data: {
    riskSummary: { high: 2, medium: 2, low: 0 },
    riskItems: [
      {
        id: "risk_001_rr001",
        title: "费用不透明",
        category: "cost_transparency",
        riskLevel: "high",
        confidence: 0.97,
        clauseText: "贷款发放时，平台服务费人民币 500 元由放款金额中一次性扣除。",
        clauseLocation: "费用说明 第 3 条",
        relatedClauseIds: ["clause_fee_003"],
        evidence: [{ evidenceId: "evidence_001_01", clauseId: "clause_fee_003", quote: "贷款发放时，平台服务费人民币 500 元由放款金额中一次性扣除。", location: { page: 4, section: "费用说明 第 3 条", paragraph: 1 } }],
        reason: "命中规则“费用不透明”。该判断参考中国人民银行公告〔2021〕第3号和《民法典》第496条，服务费应纳入综合融资成本并充分提示。",
        possibleConsequence: "用户可能低估真实借款成本，签约后发现总还款额高于预期。",
        matchedCases: [
          { caseId: "CASE001", title: "医美分期服务费披露不足纠纷", similarity: 0.37, conclusion: "服务费是否充分披露并计入综合融资成本；投诉后机构退还部分服务费。", sourceUrl: "https://example.com/cases/medical-installment-fee" },
          { caseId: "CASE003", title: "信用卡分期免息但手续费偏高纠纷", similarity: 0.2792, conclusion: "免息宣传是否充分披露手续费和折算年化成本。", sourceUrl: "https://example.com/cases/credit-card-installment-fee" }
        ],
        questionToAsk: "请机构列明所有费用项目，并说明是否已计入明示年化利率。"
      },
      {
        id: "risk_002_rr003",
        title: "提前还款限制",
        category: "prepayment",
        riskLevel: "medium",
        confidence: 0.97,
        clauseText: "借款人申请提前结清，应按剩余未还本金的 2% 支付提前结清手续费。",
        clauseLocation: "还款约定 第 8 条",
        relatedClauseIds: ["clause_prepay_008"],
        evidence: [{ evidenceId: "evidence_002_01", clauseId: "clause_prepay_008", quote: "借款人申请提前结清，应按剩余未还本金的 2% 支付提前结清手续费。", location: { page: 7, section: "还款约定 第 8 条", paragraph: 2 } }],
        reason: "命中规则“提前还款限制”。该判断参考《民法典》第677条，提前还款费用需要核实计算口径和退费规则。",
        possibleConsequence: "未来提前结清时，节省的利息可能被手续费或违约金抵消。",
        matchedCases: [
          { caseId: "CASE002", title: "培训贷退费与贷款合同分离纠纷", similarity: 0.2508, conclusion: "服务解除后贷款合同是否同步处理，是常见争议焦点。", sourceUrl: "https://example.com/cases/training-loan-refund" }
        ],
        questionToAsk: "请机构说明提前结清时手续费如何计算，已收费用是否退还。"
      },
      {
        id: "risk_003_rr004",
        title: "砍头息",
        category: "cost_transparency",
        riskLevel: "high",
        confidence: 0.97,
        clauseText: "贷款发放时，平台服务费人民币 500 元由放款金额中一次性扣除。",
        clauseLocation: "费用说明 第 3 条",
        relatedClauseIds: ["clause_fee_003"],
        evidence: [{ evidenceId: "evidence_003_01", clauseId: "clause_fee_003", quote: "贷款发放时，平台服务费人民币 500 元由放款金额中一次性扣除。", location: { page: 4, section: "费用说明 第 3 条", paragraph: 1 } }],
        reason: "命中规则“砍头息”。实际到账金额低于借款本金，需核实是否存在先扣费或变相预扣利息。",
        possibleConsequence: "名义本金与实际到手金额不一致，会推高真实年化成本。",
        matchedCases: [
          { caseId: "CASE001", title: "医美分期服务费披露不足纠纷", similarity: 0.3212, conclusion: "服务费披露不足会抬高用户实际融资成本。", sourceUrl: "https://example.com/cases/medical-installment-fee" }
        ],
        questionToAsk: "请机构说明为什么实际到账金额低于合同本金，扣除费用是否有合法依据。"
      },
      {
        id: "risk_004_rr007",
        title: "逾期罚息过高",
        category: "overdue",
        riskLevel: "medium",
        confidence: 0.97,
        clauseText: "逾期罚息为正常利率的 1.5 倍，并可能收取违约金。",
        clauseLocation: "合同摘要：逾期费用",
        relatedClauseIds: ["clause_fee_003"],
        evidence: [{ evidenceId: "evidence_004_01", clauseId: "clause_fee_003", quote: "逾期罚息为正常利率的 1.5 倍，并可能收取违约金。", location: { page: null, section: "合同摘要：逾期费用", paragraph: null } }],
        reason: "命中规则“逾期罚息过高”。逾期费用涉及罚息和违约金，D 生成建议时应提醒用户核实上限、重复计收和征信影响。",
        possibleConsequence: "一旦逾期，费用可能快速累积并影响征信。",
        matchedCases: [
          { caseId: "CASE005", title: "租房贷合同与租赁服务纠纷", similarity: 0.2788, conclusion: "服务失败后仍持续还款，用户可能面临逾期和征信压力。", sourceUrl: "https://example.com/cases/rent-loan-dispute" }
        ],
        questionToAsk: "请机构说明逾期罚息、违约金是否有上限，是否会重复计收。"
      }
    ]
  },
  warnings: [],
  errors: []
};

const DEFAULT_D_DATA = { schemaVersion: "1.0.0", agent: "recommendation_action", status: "pending", inputRunIds: [], data: null, warnings: [], errors: [] };
const state = { b: DEFAULT_B_DATA, c: DEFAULT_C_DATA, d: DEFAULT_D_DATA };
const riskLabel = { high: "高风险", medium: "中风险", low: "低风险" };
const categoryLabel = { cost_transparency: "成本透明度", interest_fee: "利息费用", repayment: "还款安排", prepayment: "提前还款", overdue: "逾期责任", authorization_privacy: "授权隐私", dispute_resolution: "争议解决", other: "其他风险" };

function byId(id) { return document.getElementById(id); }
function money(value) { return value === null || value === undefined ? "信息不足" : `${Number(value).toLocaleString("zh-CN")}元`; }
function percent(value) { return value === null || value === undefined ? "信息不足" : `${Number(value).toFixed(1)}%`; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function locationText(location) { if (!location) return "位置未标注"; const parts = []; if (location.page) parts.push(`第 ${location.page} 页`); if (location.section) parts.push(location.section); if (location.paragraph) parts.push(`第 ${location.paragraph} 段`); return parts.length ? parts.join(" · ") : "位置未标注"; }
function uniqueCount(items, key) { return new Set(items.map((item) => item[key]).filter(Boolean)).size; }
async function loadJsonFromFile(file) { return JSON.parse(await file.text()); }
async function tryFetchJson(path) { try { const response = await fetch(path, { cache: "no-store" }); if (!response.ok) throw new Error(`${response.status}`); return await response.json(); } catch (error) { return null; } }
function setMessage(message, isError = false) { const node = byId("load-message"); node.textContent = message; node.classList.toggle("is-error", isError); }
function formatJson(value) { return JSON.stringify(value, null, 2); }
function setTrace(value) { byId("trace-output").textContent = typeof value === "string" ? value : formatJson(value); }
function updateBJsonText(value) { byId("b-json-text").value = formatJson(value); }
function updateDownloadLink() {
  const link = byId("download-output-link");
  if (!state.c) {
    link.removeAttribute("href");
    return;
  }
  const blob = new Blob([formatJson(state.c)], { type: "application/json;charset=utf-8" });
  const oldUrl = link.dataset.objectUrl;
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.dataset.objectUrl = url;
}

function renderHeader() {
  const c = state.c;
  const summary = c?.data?.riskSummary || { high: 0, medium: 0, low: 0 };
  const riskItems = c?.data?.riskItems || [];
  byId("report-id").textContent = `报告编号：${c?.taskId || "未加载"}`;
  byId("high-count").textContent = summary.high ?? 0;
  byId("status-label").textContent = c?.status ? `状态：${c.status}` : "等待数据";
  byId("hero-summary").textContent = `已识别 ${riskItems.length} 个风险项，其中高风险 ${summary.high || 0} 项、中风险 ${summary.medium || 0} 项。C 输出通过 riskItems[].id 交给 D 生成建议。`;
  byId("metric-high").textContent = summary.high ?? 0;
  byId("metric-medium").textContent = summary.medium ?? 0;
  byId("metric-low").textContent = summary.low ?? 0;
  byId("metric-input-runs").textContent = c?.inputRunIds?.length ?? 0;
}

function renderBPanel() {
  const data = state.b?.data;
  const target = byId("b-content");
  if (!data) { target.className = "agent-content empty-state"; target.textContent = "暂无 B 数据"; return; }
  const summary = data.contractSummary || {};
  const cost = data.costAnalysis || {};
  const clauses = data.clauses || [];
  target.className = "agent-content";
  target.innerHTML = `<div class="fact-row"><span>合同名称</span><strong>${escapeHtml(data.contract?.contractName || "未命名")}</strong></div><div class="fact-row"><span>实际到账</span><strong>${money(summary.actualReceivedAmount)}</strong></div><div class="fact-row"><span>总还款</span><strong>${money(cost.totalRepayment)}</strong></div><div class="fact-row"><span>额外费用</span><strong>${money(cost.additionalFees)}</strong></div><div class="fact-row"><span>真实年化</span><strong>${percent(cost.realAnnualRate)}</strong></div><div class="fact-row"><span>条款数量</span><strong>${clauses.length}</strong></div><div class="fact-row"><span>传给 C</span><strong>contractSummary / clauses / costAnalysis</strong></div>`;
}

function renderCPanel() {
  const data = state.c?.data;
  const target = byId("c-content");
  if (!data) { target.className = "agent-content empty-state"; target.textContent = "暂无 C 数据"; return; }
  const riskItems = data.riskItems || [];
  const evidenceCount = riskItems.reduce((sum, item) => sum + (item.evidence?.length || 0), 0);
  const caseCount = riskItems.reduce((sum, item) => sum + (item.matchedCases?.length || 0), 0);
  const uniqueCases = uniqueCount(riskItems.flatMap((item) => item.matchedCases || []), "caseId");
  target.className = "agent-content";
  target.innerHTML = `<div class="fact-row"><span>Agent</span><strong>${escapeHtml(state.c.agent || "risk_case")}</strong></div><div class="fact-row"><span>运行 ID</span><strong>${escapeHtml(state.c.runId || "未生成")}</strong></div><div class="fact-row"><span>风险项</span><strong>${riskItems.length}</strong></div><div class="fact-row"><span>合同证据</span><strong>${evidenceCount}</strong></div><div class="fact-row"><span>案例匹配</span><strong>${caseCount} 条 / ${uniqueCases} 个案例</strong></div><div class="fact-row"><span>交给 D</span><strong>riskItems[].id</strong></div>`;
}

function renderDPanel() {
  const data = state.d?.data;
  const target = byId("d-content");
  if (!data) { target.className = "agent-content empty-state"; target.innerHTML = "等待 D 输出接入。D 应读取 C 的 <strong>riskItems[].id</strong>，并写入 recommendations[].relatedRiskIds。"; return; }
  const recommendations = data.recommendations || [];
  const questions = data.questionList || [];
  target.className = "agent-content";
  target.innerHTML = `<div class="fact-row"><span>综合等级</span><strong>${escapeHtml(data.overallResult?.level || "未给出")}</strong></div><div class="fact-row"><span>建议数量</span><strong>${recommendations.length}</strong></div><div class="fact-row"><span>问题清单</span><strong>${questions.length}</strong></div><div class="fact-row"><span>免责声明</span><strong>${data.disclaimer ? "已提供" : "缺失"}</strong></div>`;
}

function renderRiskCards() {
  const target = byId("risk-list");
  const riskItems = state.c?.data?.riskItems || [];
  if (!riskItems.length) { target.innerHTML = `<div class="empty-state">没有可展示的风险项。请上传 C 的 RiskCaseOutput JSON。</div>`; return; }
  target.innerHTML = riskItems.map((item) => {
    const evidence = item.evidence || [];
    const cases = item.matchedCases || [];
    const firstEvidence = evidence[0];
    const casesHtml = cases.length ? cases.map((matchedCase) => `<div class="case-card"><strong>${escapeHtml(matchedCase.title)}</strong><p>相似度：${matchedCase.similarity ?? "未知"}</p><p>${escapeHtml(matchedCase.conclusion)}</p></div>`).join("") : `<div class="case-card"><p>暂无可靠案例，D 可只基于风险原因生成建议。</p></div>`;
    return `<article class="risk-card"><div class="risk-card__summary"><div><h3>${escapeHtml(item.title)}</h3><div class="risk-card__meta"><span>ID：${escapeHtml(item.id)}</span><span>类别：${escapeHtml(categoryLabel[item.category] || item.category)}</span><span>置信度：${item.confidence == null ? "未知" : Math.round(item.confidence * 100) + "%"}</span><span>关联条款：${escapeHtml((item.relatedClauseIds || []).join("、") || "无")}</span></div></div><span class="risk-badge risk-badge--${escapeHtml(item.riskLevel)}">${escapeHtml(riskLabel[item.riskLevel] || item.riskLevel)}</span></div><div class="risk-card__body"><div class="quote-box"><span>合同证据 · ${escapeHtml(firstEvidence?.clauseId || "未关联")}</span><p>${escapeHtml(firstEvidence?.quote || item.clauseText || "暂无合同原文")}</p><p>${escapeHtml(locationText(firstEvidence?.location))}</p></div><div class="risk-detail-grid"><div class="text-block"><span class="sub-title">为什么是风险</span><p>${escapeHtml(item.reason)}</p></div><div class="text-block"><span class="sub-title">可能后果</span><p>${escapeHtml(item.possibleConsequence)}</p></div><div class="text-block"><span class="sub-title">给 D 的问题输入</span><p>${escapeHtml(item.questionToAsk)}</p></div></div><div><span class="sub-title">相似案例</span><div class="case-list">${casesHtml}</div></div></div></article>`;
  }).join("");
}

function renderAll() { renderHeader(); renderBPanel(); renderCPanel(); renderDPanel(); renderRiskCards(); updateDownloadLink(); }
function setupFileInput(id, key, label) {
  byId(id).addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      state[key] = await loadJsonFromFile(file);
      if (key === "b") updateBJsonText(state.b);
      renderAll();
      setMessage(key === "b" ? `已加载 ${label}：${file.name}。点击“开始分析”即可调用 C Agent。` : `已加载 ${label}：${file.name}`);
    } catch (error) {
      setMessage(`读取 ${label} 失败：${error.message}`, true);
    }
  });
}
function parseBInput() {
  const raw = byId("b-json-text").value.trim();
  if (!raw) return state.b;
  return JSON.parse(raw);
}
async function analyzeBOutput() {
  const button = byId("analyze-btn");
  try {
    const bOutput = parseBInput();
    if (!bOutput || typeof bOutput !== "object") throw new Error("请输入 B Agent 输出 JSON。");
    state.b = bOutput;
    button.disabled = true;
    button.textContent = "分析中...";
    setMessage("正在调用本地 risk_case Agent：规则引擎匹配、RAG 检索法规和案例、生成 RiskCaseOutput。");
    setTrace("Agent 正在运行...");
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bOutput }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || result.hint || `HTTP ${response.status}`);
    state.c = result.output;
    renderAll();
    setTrace(result.trace || result);
    setMessage(`分析完成：命中 ${result.trace?.hitRules?.length ?? state.c.data?.riskItems?.length ?? 0} 条风险规则，输出已写入 ${result.outputPath || "本地输出目录"}。`);
  } catch (error) {
    setMessage(`分析失败：${error.message}`, true);
    setTrace(error.stack || error.message);
  } finally {
    button.disabled = false;
    button.textContent = "开始分析";
  }
}
async function loadDefaults() {
  const [b, c] = await Promise.all([tryFetchJson("../agents/risk_case/examples/b-contract-cost-output.json"), tryFetchJson("../agents/risk_case/outputs/c-risk-case-output.json")]);
  if (b) state.b = b;
  if (c) state.c = c;
  updateBJsonText(state.b);
  renderAll();
  setTrace("尚未运行。点击“开始分析”后会显示本次规则命中、法规检索和案例匹配日志。");
  setMessage(b || c ? "已读取本地默认 JSON。你可以直接点击“开始分析”调用真实 C Agent，或粘贴新的 B JSON。" : "当前使用内置示例数据。点击“开始分析”会调用本地 Agent。");
}

setupFileInput("b-file", "b", "B 输出");
setupFileInput("c-file", "c", "C 输出");
setupFileInput("d-file", "d", "D 输出");
byId("analyze-btn").addEventListener("click", analyzeBOutput);
byId("fill-sample-btn").addEventListener("click", () => { state.b = DEFAULT_B_DATA; updateBJsonText(state.b); renderBPanel(); setMessage("已填入内置 B 示例 JSON。点击“开始分析”可运行 C Agent。"); });
renderAll();
loadDefaults();
