let currentResult = null;
let selectedFilePayload = null;
let currentContractText = "";

const $ = (id) => document.getElementById(id);
const riskLevelOrder = { high: 0, medium: 1, low: 2 };
const levelText = { high: "高风险", medium: "中风险", low: "低风险" };

function money(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return `${Number(value).toLocaleString("zh-CN")} 元`;
}

function percent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return `${Number(value).toFixed(1)}%`;
}

function plainRiskText(item) {
  const text = `${item.title || ""} ${item.reason || ""} ${item.clauseText || ""}`;
  if (text.includes("到账") || text.includes("砍头息")) return "你拿到的钱比合同本金少，但还款可能按本金算。";
  if (text.includes("服务费") || text.includes("手续费") || text.includes("管理费")) return "合同里有额外费用，可能让你实际多花钱。";
  if (text.includes("年化") || text.includes("利率")) return "这笔钱的实际成本偏高，需要重新核对。";
  if (text.includes("提前")) return "你提前还钱时，可能还要再交一笔钱。";
  if (text.includes("自动扣款") || text.includes("代扣")) return "合同给了机构较宽的扣款权限。";
  if (text.includes("征信")) return "一旦逾期，可能影响你的征信记录。";
  if (text.includes("退课") || text.includes("退费") || text.includes("培训")) return "退课或服务出问题时，你可能还要继续还贷。";
  if (text.includes("最低还款") || text.includes("循环利息")) return "只还最低金额，会继续产生利息。";
  return item.possibleConsequence || item.reason || "这条内容可能增加你的费用或维权难度。";
}

function getBData() {
  const bData = ((currentResult || {}).bOutput || {}).data || {};
  return {
    summary: bData.contractSummary || {},
    cost: bData.costAnalysis || {},
  };
}

function buildDataBasis(item) {
  const { summary, cost } = getBData();
  const text = `${item.title || ""} ${item.reason || ""} ${item.clauseText || ""}`;
  const basis = [];
  const loanAmount = Number(summary.loanAmount || 0);
  const actualReceived = Number(summary.actualReceivedAmount || 0);
  const additionalFees = Number(cost.additionalFees || 0);
  const totalRepayment = Number(cost.totalRepayment || 0);
  const extraCost = Number(cost.extraCost || 0);
  const realAnnualRate = Number(cost.realAnnualRate || 0);

  if (text.includes("到账") || text.includes("砍头息") || actualReceived < loanAmount) {
    basis.push(`合同写的本金是 ${money(loanAmount)}，你实际到账是 ${money(actualReceived)}。`);
    if (loanAmount > actualReceived) {
      basis.push(`少到账 ${money(loanAmount - actualReceived)}，但还款义务仍可能按 ${money(loanAmount)} 计算。`);
    }
  }

  if (text.includes("服务费") || text.includes("手续费") || text.includes("管理费") || text.includes("额外费用") || additionalFees > 0) {
    basis.push(`系统从合同中识别到额外费用 ${money(additionalFees)}。`);
    if (loanAmount > 0 && additionalFees > 0) {
      basis.push(`这笔费用约占本金的 ${(additionalFees / loanAmount * 100).toFixed(1)}%。`);
    }
  }

  if (text.includes("年化") || text.includes("利率") || text.includes("实际成本")) {
    basis.push(`系统按合同金额、到账金额、期数和费用估算，一年实际成本约为 ${percent(realAnnualRate)}。`);
    if (realAnnualRate >= 24) {
      basis.push("这个成本已经偏高，所以会被标成高风险。");
    }
  }

  if (text.includes("总还款") || text.includes("成本") || extraCost > 0) {
    basis.push(`你预计一共要还 ${money(totalRepayment)}，除本金外可能多付 ${money(extraCost || additionalFees)}。`);
  }

  if (text.includes("提前")) {
    basis.push(`提前还款规则来自合同摘要：${summary.prepaymentRule || "合同没有说清楚提前还款规则"}。`);
  }

  if (text.includes("逾期") || text.includes("征信") || text.includes("违约金")) {
    basis.push(`逾期规则来自合同摘要：${summary.overdueFee || "合同没有说清楚逾期费用"}。`);
  }

  if (text.includes("退课") || text.includes("退费") || text.includes("培训")) {
    basis.push("判断依据来自合同里的退课、退费、服务解除和贷款继续履行条款。");
  }

  if (!basis.length) {
    basis.push("判断依据来自合同原文中被引用的风险条款。");
    if (item.reason) basis.push(item.reason.replace(/^命中规则“.*?”。/, ""));
  }

  return [...new Set(basis.filter(Boolean))].slice(0, 4);
}

function buildReferenceBasis(item) {
  const regulations = item.legalReferences || [];
  const basis = buildDataBasis(item).map((text) => ({ type: "数据依据", text }));
  regulations.slice(0, 2).forEach((reg) => {
    basis.push({ type: "法规依据", text: reg.title || reg.summary || "相关法规" });
  });
  return basis;
}

function conclusionClass(decisionLevel) {
  if (decisionLevel === "do_not_sign") return "danger";
  if (decisionLevel === "be_careful" || decisionLevel === "need_more_info") return "warning";
  return "safe";
}

function setStep(id, state, label) {
  const el = $(id);
  el.classList.remove("running", "done");
  if (state) el.classList.add(state);
  el.querySelector("small").textContent = label;
}

function resetSteps() {
  setStep("stepB", "", "等待开始");
  setStep("stepC", "", "等待开始");
  setStep("stepD", "", "等待开始");
}

async function loadSample(name) {
  const response = await fetch(`/demo/sample_contracts/${name}`, { cache: "no-store" });
  const text = await response.text();
  $("contractText").value = text;
  currentContractText = text;
  selectedFilePayload = null;
  $("fileName").textContent = "未选择文件";
  highlightContractText();
}

function renderConclusion(result) {
  const summary = result.summary || {};
  const decision = summary.decision || {};
  const className = conclusionClass(decision.level);
  $("conclusionCard").className = `conclusion-card ${className}`;
  $("headline").textContent = summary.headline || "已完成分析";
  $("summaryReason").textContent = decision.reason || "请查看下方风险和建议。";
}

function renderNumbers(result) {
  const bData = (result.bOutput || {}).data || {};
  const contractSummary = bData.contractSummary || {};
  const cost = bData.costAnalysis || {};
  $("actualReceived").textContent = money(contractSummary.actualReceivedAmount);
  $("totalRepayment").textContent = money(cost.totalRepayment);
  $("extraCost").textContent = money(cost.extraCost || cost.additionalFees);
  $("annualRate").textContent = percent(cost.realAnnualRate);
  $("annualRate").className = (cost.realAnnualRate || 0) >= 24 ? "num-danger" : (cost.realAnnualRate || 0) >= 15 ? "num-warning" : "num-safe";
  $("annualText").textContent = (cost.realAnnualRate || 0) >= 24 ? "这已经偏高，建议先别签。" : "这个数字要和机构再次确认。";
  $("extraText").textContent = "这是除本金外，你可能多付的钱。";
}

function riskDetailHtml(item, index) {
  const cases = item.matchedCases || [];
  const quote = (item.evidence || [])[0]?.quote || item.clauseText || "";
  const basis = buildReferenceBasis(item);
  return `
    <article class="risk-card ${item.riskLevel || "medium"}" data-risk-index="${index}">
      <button class="risk-head" type="button">
        <span class="badge ${item.riskLevel || "medium"}">${levelText[item.riskLevel] || "风险"}</span>
        <strong>${item.title || "需要注意的风险"}</strong>
        <span class="toggle">展开</span>
      </button>
      <p>${plainRiskText(item)}</p>
      <div class="risk-detail">
        <div class="detail-block">
          <b>合同里是哪句话？</b>
          <p>${quote || "未找到可展示的原文。"}</p>
          <button class="link-btn" type="button" data-quote="${encodeURIComponent(quote)}">查看合同原文</button>
        </div>
        <div class="detail-block">
          <b>为什么这么判断？</b>
          <ul class="basis-list">
            ${basis.map((basisItem) => `<li><span>${basisItem.type}</span>${basisItem.text}</li>`).join("")}
          </ul>
        </div>
        <div class="detail-block">
          <b>相似案例</b>
          <ul>
            ${cases.slice(0, 2).map((itemCase) => `<li>${itemCase.title || "相似纠纷案例"}</li>`).join("") || "<li>暂无案例引用</li>"}
          </ul>
        </div>
      </div>
    </article>
  `;
}

function renderRisks(result) {
  const riskItems = (((result.cOutput || {}).data || {}).riskItems || [])
    .slice()
    .sort((a, b) => (riskLevelOrder[a.riskLevel] ?? 9) - (riskLevelOrder[b.riskLevel] ?? 9));
  $("riskList").className = riskItems.length ? "risk-list" : "risk-list empty";
  $("riskList").innerHTML = riskItems.length ? riskItems.map(riskDetailHtml).join("") : "暂未发现明显风险。";

  document.querySelectorAll(".risk-head").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".risk-card");
      card.classList.toggle("open");
      button.querySelector(".toggle").textContent = card.classList.contains("open") ? "收起" : "展开";
    });
  });

  document.querySelectorAll(".link-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const quote = decodeURIComponent(button.dataset.quote || "");
      highlightContractText(quote);
      $("highlightedContract").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

function renderActions(result) {
  const recommendations = (((result.dOutput || {}).data || {}).recommendations || []);
  $("actionList").className = recommendations.length ? "action-list" : "action-list empty";
  $("actionList").innerHTML = recommendations.length ? recommendations.map((action, index) => `
    <article class="action-card">
      <span>${index + 1}</span>
      <div>
        <h3>${action.title || "下一步建议"}</h3>
        <p>${action.content || action.text || "请机构书面说明相关条款。"}</p>
      </div>
    </article>
  `).join("") : "暂无建议。";
}

function renderSourceNote(result) {
  const usage = ((result.cTrace || {}).knowledgeUsage || {});
  const time = (result.summary || {}).generatedAt || new Date().toLocaleString("zh-CN");
  $("sourceNote").textContent = `本报告基于 ${usage.riskRulesLoaded || 0} 条风险规则、${usage.regulationsRetrieved || 0} 条法规、${usage.casesRetrieved || 0} 个案例生成。分析时间：${time}`;
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[ch]));
}

function highlightContractText(quote = "") {
  const text = $("contractText").value || currentContractText || "";
  currentContractText = text;
  if (!text) {
    $("highlightedContract").innerHTML = "暂无合同原文";
    return;
  }
  if (!quote) {
    $("highlightedContract").innerHTML = escapeHtml(text);
    return;
  }
  const cleanQuote = quote.trim();
  const index = text.indexOf(cleanQuote);
  if (index < 0) {
    $("highlightedContract").innerHTML = `${escapeHtml(text)}<p class="not-found">没有在原文中精确找到这句话，可能因为解析时做了截断。</p>`;
    return;
  }
  $("highlightedContract").innerHTML = `${escapeHtml(text.slice(0, index))}<mark>${escapeHtml(cleanQuote)}</mark>${escapeHtml(text.slice(index + cleanQuote.length))}`;
}

function renderReport(result) {
  renderConclusion(result);
  renderNumbers(result);
  renderRisks(result);
  renderActions(result);
  renderSourceNote(result);
  highlightContractText();
  renderJson("summary");
}

function renderJson(tab = "summary") {
  if (!currentResult) {
    $("jsonView").textContent = "{}";
    return;
  }
  document.querySelectorAll(".json-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  $("jsonView").textContent = JSON.stringify(currentResult[tab] || {}, null, 2);
}

async function analyze() {
  const text = $("contractText").value.trim();
  if (!text && !selectedFilePayload) {
    alert("请先粘贴合同文本，或上传 txt/pdf 文件。");
    return;
  }

  $("analyzeBtn").disabled = true;
  $("analyzeBtn").textContent = "分析中...";
  resetSteps();
  setStep("stepB", "running", "正在读合同");

  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    setStep("stepB", "done", "合同已读完");
    setStep("stepC", "running", "正在找风险");

    const payload = { contractText: text };
    if (selectedFilePayload) Object.assign(payload, selectedFilePayload);
    const response = await fetch("/api/demo/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "分析失败");

    setStep("stepC", "done", "风险已找出");
    setStep("stepD", "running", "正在生成建议");
    await new Promise((resolve) => setTimeout(resolve, 250));
    setStep("stepD", "done", "建议已生成");

    currentResult = result;
    currentContractText = text || currentContractText;
    renderReport(result);
  } catch (error) {
    alert(error.message);
    setStep("stepC", "", "分析失败");
  } finally {
    $("analyzeBtn").disabled = false;
    $("analyzeBtn").textContent = "开始分析";
  }
}

function buildAdviceText() {
  if (!currentResult) return "";
  const recommendations = (((currentResult.dOutput || {}).data || {}).recommendations || []);
  return recommendations.map((item, index) => `${index + 1}. ${item.title || "建议"}：${item.content || item.text || ""}`).join("\n");
}

async function copyAdvice() {
  const text = buildAdviceText();
  if (!text) {
    alert("还没有建议可以复制。");
    return;
  }
  await navigator.clipboard.writeText(text);
  alert("建议已复制，可以发给朋友或机构。");
}

function exportReport() {
  window.print();
}

function readFileAsPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("文件读取失败"));
    if (file.name.toLowerCase().endsWith(".pdf")) {
      reader.onload = () => {
        const base64 = String(reader.result).split(",")[1];
        resolve({ filename: file.name, fileContent: base64, contractText: "" });
      };
      reader.readAsDataURL(file);
      return;
    }
    reader.onload = () => resolve({ filename: file.name, contractText: String(reader.result || "") });
    reader.readAsText(file, "utf-8");
  });
}

document.querySelectorAll("[data-sample]").forEach((button) => {
  button.addEventListener("click", () => loadSample(button.dataset.sample));
});

$("fileInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  $("fileName").textContent = file.name;
  const payload = await readFileAsPayload(file);
  if (payload.contractText) {
    $("contractText").value = payload.contractText;
    currentContractText = payload.contractText;
    selectedFilePayload = null;
    highlightContractText();
  } else {
    selectedFilePayload = payload;
    $("contractText").value = "";
  }
});

$("contractText").addEventListener("input", () => {
  currentContractText = $("contractText").value;
  highlightContractText();
});

$("analyzeBtn").addEventListener("click", analyze);
$("copyAdviceBtn").addEventListener("click", copyAdvice);
$("exportBtn").addEventListener("click", exportReport);
$("clearBtn").addEventListener("click", () => {
  $("contractText").value = "";
  currentResult = null;
  currentContractText = "";
  selectedFilePayload = null;
  $("fileName").textContent = "未选择文件";
  resetSteps();
  $("headline").textContent = "等待合同输入";
  $("summaryReason").textContent = "粘贴合同后点击“开始分析”，我会帮你把风险翻译成人话。";
  $("riskList").className = "risk-list empty";
  $("riskList").textContent = "暂无风险结果";
  $("actionList").className = "action-list empty";
  $("actionList").textContent = "暂无建议";
  $("highlightedContract").textContent = "暂无高亮内容";
  renderJson();
});

document.querySelectorAll(".json-tabs button").forEach((button) => {
  button.addEventListener("click", () => renderJson(button.dataset.tab));
});

loadSample("contract_1_consumer_loan.txt");
