import { ANALYSIS_PROTOCOL_VERSION } from "../../../../shared/analysisProtocol";
import type {
  ContractClause,
  ContractCostOutput,
  RecommendationActionOutput,
  RiskCaseOutput,
} from "../../../../shared/analysisProtocol";
import type {
  ActionItem,
  ActionSection,
  PipelineReport,
  PipelineRiskItem,
  PipelineStep,
  ReferenceGroup,
} from "../types/pipeline";

const contractId = "contract_mock_course_project_001";

const steps: PipelineStep[] = [
  {
    agent: "contract_cost",
    label: "B 合同与成本 Agent",
    status: "completed",
    message: "合同解析与成本测算完成",
  },
  {
    agent: "risk_case",
    label: "C 风险与案例 Agent",
    status: "completed",
    message: "风险识别与案例匹配完成",
  },
  {
    agent: "recommendation_action",
    label: "D 建议与行动 Agent",
    status: "completed",
    message: "建议与行动方案完成",
  },
];

const clauses = [
  {
    clauseId: "clause_001_principal",
    category: "repayment",
    heading: "借款金额与期限",
    text: "借款本金为人民币 10000 元，期限 12 个月，分 12 期按月等额还款。",
    location: { page: null, section: "第一条 借款基本信息", paragraph: 1 },
  },
  {
    clauseId: "clause_002_repayment",
    category: "repayment",
    heading: "还款安排",
    text: "借款人每月应还款 900 元，合计还款 10800 元，名义年利率为 7.2%。",
    location: { page: null, section: "第三条 还款安排", paragraph: 1 },
  },
  {
    clauseId: "clause_003_service_fee",
    category: "interest_fee",
    heading: "服务费",
    text: "本合同服务费为 500 元，由服务机构在放款时一次性从借款本金中扣除，借款人实际到账 9500 元。",
    location: { page: null, section: "第二条 费用说明", paragraph: 1 },
  },
  {
    clauseId: "clause_004_prepayment",
    category: "prepayment",
    heading: "提前还款",
    text: "借款人提前结清时，应提前 3 个工作日申请，并按剩余未还本金的 2% 支付提前还款手续费。",
    location: { page: null, section: "第五条 提前还款", paragraph: 1 },
  },
  {
    clauseId: "clause_005_overdue",
    category: "overdue",
    heading: "逾期处理",
    text: "借款人逾期还款的，应按逾期本金每日 0.05% 支付逾期罚息，并承担催收通知等合理费用。",
    location: { page: null, section: "第六条 逾期与违约", paragraph: 1 },
  },
  {
    clauseId: "clause_006_auto_debit",
    category: "authorization_privacy",
    heading: "自动扣款授权",
    text: "借款人授权示例消费金融服务机构及其合作支付机构从绑定银行卡自动扣划到期应还款、逾期款项及相关费用。",
    location: { page: null, section: "第四条 自动扣款授权", paragraph: 1 },
  },
] satisfies [
  ContractClause,
  ContractClause,
  ContractClause,
  ContractClause,
  ContractClause,
  ContractClause,
];

const riskCategoryLabel = {
  cost_transparency: "成本透明度",
  interest_fee: "利息与费用",
  repayment: "还款安排",
  prepayment: "提前还款",
  overdue: "逾期处理",
  authorization_privacy: "授权与隐私",
  dispute_resolution: "争议解决",
  other: "其他",
};

const buildContractCostOutput = (taskId: string, generatedAt: string): ContractCostOutput => ({
  schemaVersion: ANALYSIS_PROTOCOL_VERSION,
  taskId,
  contractId,
  runId: `run_contract_cost_${taskId}`,
  agent: "contract_cost",
  agentVersion: "b-mock-contract-0.1.0",
  status: "completed",
  generatedAt,
  inputRunIds: [],
  data: {
    contract: {
      contractName: "课程项目测试合同.txt",
      fileSha256: null,
      pageCount: null,
    },
    contractSummary: {
      institution: "示例消费金融服务机构",
      productType: "个人消费贷款",
      loanAmount: 10_000,
      actualReceivedAmount: 9_500,
      loanTermMonths: 12,
      installmentCount: 12,
      monthlyPayment: 900,
      repaymentMethod: "按月等额还款",
      nominalRate: 7.2,
      prepaymentRule: "提前结清按剩余未还本金 2% 收取手续费。",
      overdueFee: "逾期本金每日 0.05% 罚息，并可能产生合理通知费用。",
    },
    clauses,
    repaymentSchedule: Array.from({ length: 12 }, (_, index) => ({
      period: index + 1,
      dueDate: null,
      principal: null,
      interest: null,
      fees: null,
      payment: 900,
    })),
    costAnalysis: {
      totalRepayment: 10_800,
      totalInterest: 800,
      additionalFees: 500,
      realAnnualRate: 24.4,
      calculationBasis: [
        "按实际到账 9500 元作为借款人收到现金流入。",
        "按 12 期、每期 900 元作为正常还款现金流出，总还款 10800 元。",
        "放款时预扣 500 元服务费计入综合融资成本，真实年化约 24.4%。",
      ],
    },
  },
  warnings: [],
  errors: [],
});

const buildRiskCaseOutput = (taskId: string, generatedAt: string): RiskCaseOutput => ({
  schemaVersion: ANALYSIS_PROTOCOL_VERSION,
  taskId,
  contractId,
  runId: `run_risk_case_${taskId}`,
  agent: "risk_case",
  agentVersion: "c-mock-risk-case-0.1.0",
  status: "completed",
  generatedAt,
  inputRunIds: [`run_contract_cost_${taskId}`],
  data: {
    riskSummary: { high: 2, medium: 3, low: 0 },
    riskItems: [
      {
        id: "risk_service_fee_deducted",
        title: "服务费预扣导致实际到账少于合同本金",
        category: "interest_fee",
        riskLevel: "high",
        confidence: 0.94,
        clauseText: clauses[2].text,
        clauseLocation: "第二条 费用说明",
        relatedClauseIds: ["clause_003_service_fee"],
        evidence: [{
          evidenceId: "evidence_service_fee_deducted",
          clauseId: "clause_003_service_fee",
          quote: clauses[2].text,
          location: clauses[2].location,
        }],
        reason: "合同本金为 10000 元，但服务费 500 元在放款时扣除，借款人实际可使用资金只有 9500 元。",
        possibleConsequence: "如果仍按 10000 元本金展示费率，借款人可能低估实际资金成本。",
        matchedCases: [{
          caseId: "demo_case_fee_deducted",
          title: "演示案例：服务费预扣导致到账金额减少",
          similarity: 0.82,
          conclusion: "预扣费用通常应纳入综合融资成本核对。",
          sourceUrl: null,
        }],
        questionToAsk: "请确认 500 元服务费是否为获得贷款必须支付，是否已计入对外展示的综合年化成本。",
      },
      {
        id: "risk_real_rate_gap",
        title: "真实年化明显高于名义年利率",
        category: "cost_transparency",
        riskLevel: "high",
        confidence: 0.91,
        clauseText: "名义年利率为 7.2%；实际到账 9500 元，每月还款 900 元，共 12 期。",
        clauseLocation: "第二条、第三条",
        relatedClauseIds: ["clause_002_repayment", "clause_003_service_fee"],
        evidence: [
          {
            evidenceId: "evidence_nominal_rate",
            clauseId: "clause_002_repayment",
            quote: clauses[1].text,
            location: clauses[1].location,
          },
          {
            evidenceId: "evidence_actual_received",
            clauseId: "clause_003_service_fee",
            quote: clauses[2].text,
            location: clauses[2].location,
          },
        ],
        reason: "按实际到账和每期还款测算，真实年化约 24.4%，与 7.2% 名义年利率差异较大。",
        possibleConsequence: "只看名义年利率可能影响签约判断、比价和还款压力评估。",
        matchedCases: [{
          caseId: "demo_case_rate_gap",
          title: "典型情景：低名义利率叠加固定费用",
          similarity: 0.78,
          conclusion: "应以现金流口径核对真实年化。",
          sourceUrl: null,
        }],
        questionToAsk: "请机构提供包含利息、服务费和所有必要费用的综合年化利率说明。",
      },
      {
        id: "risk_prepayment_fee",
        title: "提前还款手续费可能削弱提前结清收益",
        category: "prepayment",
        riskLevel: "medium",
        confidence: 0.88,
        clauseText: clauses[3].text,
        clauseLocation: "第五条 提前还款",
        relatedClauseIds: ["clause_004_prepayment"],
        evidence: [{
          evidenceId: "evidence_prepayment_fee",
          clauseId: "clause_004_prepayment",
          quote: clauses[3].text,
          location: clauses[3].location,
        }],
        reason: "提前结清按剩余未还本金 2% 收费，且未说明已扣服务费是否退还。",
        possibleConsequence: "提前还款节省的利息可能被手续费抵消，实际结清金额高于预期。",
        matchedCases: [{
          caseId: "demo_case_prepayment",
          title: "典型情景：提前结清前未确认手续费",
          similarity: 0.72,
          conclusion: "应在提前还款前索取书面结清试算。",
          sourceUrl: null,
        }],
        questionToAsk: "请确认提前还款手续费计算基数、减免条件，以及已扣服务费是否按未使用期限退还。",
      },
      {
        id: "risk_overdue_penalty",
        title: "逾期罚息和通知费用边界需确认",
        category: "overdue",
        riskLevel: "medium",
        confidence: 0.86,
        clauseText: clauses[4].text,
        clauseLocation: "第六条 逾期与违约",
        relatedClauseIds: ["clause_005_overdue"],
        evidence: [{
          evidenceId: "evidence_overdue_penalty",
          clauseId: "clause_005_overdue",
          quote: clauses[4].text,
          location: clauses[4].location,
        }],
        reason: "合同约定每日 0.05% 逾期罚息，同时提到合理通知费用，但没有列出费用上限和明细。",
        possibleConsequence: "短期逾期也可能产生较快累积的违约成本，并带来费用争议。",
        matchedCases: [{
          caseId: "demo_case_overdue",
          title: "典型情景：逾期费用项目不够清楚",
          similarity: 0.69,
          conclusion: "应明确逾期费用上限、计算方式和通知渠道。",
          sourceUrl: null,
        }],
        questionToAsk: "请确认逾期罚息、违约金、通知费用是否会叠加收取，是否有封顶规则。",
      },
      {
        id: "risk_auto_debit_authorization",
        title: "自动扣款授权范围较宽",
        category: "authorization_privacy",
        riskLevel: "medium",
        confidence: 0.84,
        clauseText: clauses[5].text,
        clauseLocation: "第四条 自动扣款授权",
        relatedClauseIds: ["clause_006_auto_debit"],
        evidence: [{
          evidenceId: "evidence_auto_debit",
          clauseId: "clause_006_auto_debit",
          quote: clauses[5].text,
          location: clauses[5].location,
        }],
        reason: "授权对象包括机构及合作支付机构，扣划范围包括到期款、逾期款和相关费用，需要确认取消和异议处理机制。",
        possibleConsequence: "如果扣款异常，可能出现重复扣款、争议款项先扣后退或解绑银行卡困难。",
        matchedCases: [{
          caseId: "demo_case_auto_debit",
          title: "典型情景：自动扣款授权边界不清",
          similarity: 0.74,
          conclusion: "应保留授权、扣款和异议处理凭证。",
          sourceUrl: null,
        }],
        questionToAsk: "请确认自动扣款授权能否取消或更换银行卡，异常扣款的退款时限和处理入口是什么。",
      },
    ],
  },
  warnings: [],
  errors: [],
});

const buildRecommendationOutput = (taskId: string, generatedAt: string): RecommendationActionOutput => ({
  schemaVersion: ANALYSIS_PROTOCOL_VERSION,
  taskId,
  contractId,
  runId: `run_recommendation_action_${taskId}`,
  agent: "recommendation_action",
  agentVersion: "d-mock-action-0.1.0",
  status: "completed",
  generatedAt,
  inputRunIds: [`run_contract_cost_${taskId}`, `run_risk_case_${taskId}`],
  data: {
    overallResult: {
      level: "verify",
      summary: "这份演示合同的核心问题不是能否还款，而是名义利率、实际到账和服务费共同导致真实年化明显升高。签约前应先拿到书面综合年化、费用退还和扣款授权说明。",
    },
    recommendations: [
      {
        id: "rec_confirm_total_cost",
        priority: "must",
        action: "要求机构书面列明综合年化和所有必须支付费用。",
        rationale: "服务费预扣和名义利率差异会直接影响真实成本判断。",
        timing: "before_signing",
        relatedRiskIds: ["risk_service_fee_deducted", "risk_real_rate_gap"],
      },
      {
        id: "rec_confirm_prepayment",
        priority: "should",
        action: "提前还款前索取结清试算，确认手续费和服务费退还规则。",
        rationale: "提前结清可能并不一定节省成本。",
        timing: "during_repayment",
        relatedRiskIds: ["risk_prepayment_fee"],
      },
      {
        id: "rec_confirm_overdue",
        priority: "should",
        action: "确认逾期罚息、违约金和通知费用是否叠加及是否封顶。",
        rationale: "逾期条款存在费用边界不清的问题。",
        timing: "when_overdue",
        relatedRiskIds: ["risk_overdue_penalty"],
      },
      {
        id: "rec_keep_debit_evidence",
        priority: "optional",
        action: "保存扣款授权、解绑银行卡和每期扣款记录。",
        rationale: "自动扣款授权范围较宽，凭证有助于处理异常扣款。",
        timing: "anytime",
        relatedRiskIds: ["risk_auto_debit_authorization"],
      },
    ],
    questionList: [
      "综合年化是否已包含 500 元服务费和所有必须支付费用？",
      "服务费为何从放款中扣除，能否改为不预扣或降低金额？",
      "提前结清时手续费如何计算，已扣服务费是否退还？",
      "逾期罚息、违约金和通知费用是否叠加收取，是否有上限？",
      "自动扣款授权如何取消、更换银行卡，异常扣款多久处理？",
    ],
    disclaimer: "本报告为课程项目演示数据，不构成法律、投资或信贷决策意见。",
  },
  warnings: [],
  errors: [],
});

const toPipelineRiskItems = (riskCase: RiskCaseOutput): PipelineRiskItem[] =>
  riskCase.data?.riskItems.map((item) => ({
    ...item,
    categoryLabel: riskCategoryLabel[item.category],
  })) ?? [];

const references: ReferenceGroup[] = [
  {
    id: "similar_cases",
    title: "相似案例",
    items: [
      {
        id: "ref_case_fee_deducted",
        title: "服务费预扣导致到账金额减少",
        tag: "演示案例",
        summary: "典型情景：合同本金高于实际到账，服务费在放款时一次性扣除，用户只看名义利率会低估成本。",
      },
      {
        id: "ref_case_auto_debit",
        title: "自动扣款授权边界不清",
        tag: "典型情景",
        summary: "典型情景：扣款授权覆盖到期款和逾期费用，但取消方式、异常扣款退款时限没有写清楚。",
      },
    ],
  },
  {
    id: "regulation_refs",
    title: "法规参考",
    items: [
      {
        id: "ref_rule_total_cost",
        title: "综合融资成本披露",
        tag: "规则参考",
        summary: "演示规则：与取得借款直接相关、正常履约下必须支付的费用，应在综合成本口径中核对。",
      },
      {
        id: "ref_rule_evidence",
        title: "合同原文和书面确认优先",
        tag: "规则参考",
        summary: "演示规则：争议发生时，合同原文、费用明细、还款计划和机构书面回复比口头说明更容易核对。",
      },
    ],
  },
  {
    id: "market_rate_refs",
    title: "市场利率参考",
    items: [
      {
        id: "ref_market_rate_gap",
        title: "名义利率与现金流年化差异",
        tag: "典型情景",
        summary: "典型情景：低名义利率叠加预扣费用时，现金流年化可能明显高于合同展示利率。",
      },
    ],
  },
  {
    id: "product_refs",
    title: "产品参考",
    items: [
      {
        id: "ref_product_installment",
        title: "12 期等额还款消费贷",
        tag: "产品参考",
        summary: "演示产品：本金 10000 元，到账 9500 元，12 期每期 900 元，适合用于验证 B/C/D 展示链路。",
      },
    ],
  },
];

const actionItems: ActionItem[] = [
  {
    id: "action_total_cost",
    priority: "must",
    title: "确认综合年化和全部费用",
    detail: "要求机构用书面材料列出 10000 元本金、9500 元到账、500 元服务费、12 期还款和综合年化的对应关系。",
    stage: "before_signing",
    relatedRiskIds: ["risk_service_fee_deducted", "risk_real_rate_gap"],
  },
  {
    id: "action_fee_refund",
    priority: "must",
    title: "确认服务费是否可退",
    detail: "重点确认提前结清、取消合同或放款失败时，已扣服务费是否退还以及退还比例。",
    stage: "before_signing",
    relatedRiskIds: ["risk_service_fee_deducted", "risk_prepayment_fee"],
  },
  {
    id: "action_keep_repayment_records",
    priority: "should",
    title: "保留每期扣款和余额记录",
    detail: "每月保存扣款短信、账单截图和还款后余额，方便核对是否多扣或错扣。",
    stage: "during_repayment",
    relatedRiskIds: ["risk_auto_debit_authorization"],
  },
  {
    id: "action_prepayment_quote",
    priority: "should",
    title: "提前还款前索取结清试算",
    detail: "在申请提前结清前，要求机构出具剩余本金、手续费、利息减免和最终结清金额。",
    stage: "before_prepayment",
    relatedRiskIds: ["risk_prepayment_fee"],
  },
  {
    id: "action_overdue_boundary",
    priority: "should",
    title: "出现逾期时先确认费用口径",
    detail: "尽快确认逾期天数、罚息本金、日利率、是否另收违约金和通知费用，并保留沟通记录。",
    stage: "when_overdue",
    relatedRiskIds: ["risk_overdue_penalty"],
  },
  {
    id: "action_dispute_evidence",
    priority: "optional",
    title: "发生争议时整理证据包",
    detail: "按时间线整理合同、还款计划、扣款记录、机构回复和投诉记录，先用书面方式提出异议。",
    stage: "when_dispute",
    relatedRiskIds: ["risk_auto_debit_authorization", "risk_overdue_penalty"],
  },
];

const actionPlan: ActionSection[] = [
  { stage: "before_signing", title: "签约前", items: actionItems.filter((item) => item.stage === "before_signing") },
  { stage: "during_repayment", title: "还款期间", items: actionItems.filter((item) => item.stage === "during_repayment") },
  { stage: "before_prepayment", title: "提前还款前", items: actionItems.filter((item) => item.stage === "before_prepayment") },
  { stage: "when_overdue", title: "出现逾期时", items: actionItems.filter((item) => item.stage === "when_overdue") },
  { stage: "when_dispute", title: "发生争议时", items: actionItems.filter((item) => item.stage === "when_dispute") },
];

export const createMockPipelineReport = (taskId = "mock_bcd_demo"): PipelineReport => {
  const generatedAt = new Date().toISOString();
  const contractCost = buildContractCostOutput(taskId, generatedAt);
  const riskCase = buildRiskCaseOutput(taskId, generatedAt);
  const recommendationAction = buildRecommendationOutput(taskId, generatedAt);

  return {
    taskId,
    contractId,
    status: "completed",
    mode: "mock",
    generatedAt,
    steps,
    contractCost,
    riskCase,
    recommendationAction,
    overview: {
      institution: "示例消费金融服务机构",
      productType: "个人消费贷款",
      loanAmount: 10_000,
      actualReceivedAmount: 9_500,
      termMonths: 12,
      installmentCount: 12,
      monthlyPayment: 900,
      nominalAnnualRate: 7.2,
      realAnnualRate: 24.4,
    },
    costAnalysis: {
      totalRepayment: 10_800,
      totalInterest: 800,
      additionalFees: 500,
      principalGap: 500,
      rateGap: 17.2,
      costLevel: "high",
      calculationBasis: [
        "合同本金 10000 元，服务费 500 元放款时扣除，实际到账 9500 元。",
        "还款安排为 12 期，每期 900 元，总还款额 10800 元。",
        "按实际到账 9500 元和每期还款现金流估算，真实年化约 24.4%，高于名义年利率 7.2%。",
      ],
    },
    risks: toPipelineRiskItems(riskCase),
    references,
    actions: {
      overallLevel: "verify",
      summary: recommendationAction.data?.overallResult.summary ?? "",
      mustConfirm: actionItems.filter((item) => item.priority === "must"),
      shouldConfirm: actionItems.filter((item) => item.priority === "should"),
      optionalOptimizations: actionItems.filter((item) => item.priority === "optional"),
      questionList: recommendationAction.data?.questionList ?? [],
      evidenceChecklist: [
        "合同全文和签约页截图",
        "放款流水或到账通知，证明实际到账 9500 元",
        "服务费扣除说明和费用明细",
        "12 期还款计划、每期扣款记录和还款后余额",
        "提前还款试算、逾期费用说明、自动扣款授权或取消授权记录",
        "与机构沟通的短信、邮件、在线客服记录或投诉编号",
      ],
      communicationScripts: [
        "请帮我确认这笔借款的综合年化成本，是否已经包含 500 元服务费和所有必须支付费用？请用书面形式回复。",
        "如果我提前结清，请提供剩余本金、提前还款手续费、服务费退还规则和最终结清金额的试算明细。",
        "我希望确认自动扣款授权的范围、取消方式和异常扣款退款时限，请提供对应规则说明。",
      ],
      actionPlan,
    },
    warnings: ["Mock 演示模式：C/D 结果为静态演示数据，未调用真实 C/D Agent。"],
  };
};
