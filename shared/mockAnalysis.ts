import type { AnalysisResult } from "./analysis.js";

export const DEMO_TASK_ID = "demo_001";

export const createMockAnalysisResult = (taskId = DEMO_TASK_ID): AnalysisResult => ({
  taskId,
  status: "completed",
  contractName: "示例消费贷合同.pdf",
  contractSummary: {
    institution: "安心消费金融有限公司",
    productType: "个人消费贷款",
    loanAmount: 10_000,
    actualReceivedAmount: 9_500,
    loanTermMonths: 12,
    installmentCount: 12,
    monthlyPayment: 940,
    repaymentMethod: "按月等额还款",
    nominalRate: 12.8,
    prepaymentRule: "提前结清需支付剩余本金 2% 的手续费",
    overdueFee: "逾期罚息为正常利率的 1.5 倍，并可能收取违约金",
  },
  costAnalysis: {
    totalRepayment: 11_280,
    totalInterest: 1_280,
    additionalFees: 500,
    realAnnualRate: 23.4,
  },
  riskItems: [
    {
      id: "fee-transparency",
      title: "费用不透明",
      riskLevel: "high",
      clauseText: "贷款发放时，平台服务费人民币 500 元由放款金额中一次性扣除。",
      clauseLocation: "费用说明 第 3 条",
      reason: "合同写明借款 10,000 元，但实际到账只有 9,500 元，服务费会抬高真实借款成本。",
      possibleConsequence: "展示的名义费率可能没有完整反映你实际承担的资金成本。",
      questionToAsk: "500 元服务费是否已计入对外展示的年化利率？",
    },
    {
      id: "early-repayment",
      title: "提前还款限制",
      riskLevel: "medium",
      clauseText: "借款人申请提前结清，应按剩余未还本金的 2% 支付提前结清手续费。",
      clauseLocation: "还款约定 第 8 条",
      reason: "即使提前还款，仍需额外支付一笔手续费，节省的利息可能低于预期。",
      possibleConsequence: "未来资金宽裕时提前结清，可能仍要承担数百元额外费用。",
      questionToAsk: "提前还款手续费是否有减免条件，已经支付的服务费是否退还？",
    },
    {
      id: "auto-debit",
      title: "自动扣款授权",
      riskLevel: "medium",
      clauseText: "借款人不可撤销地授权贷款人及合作支付机构从绑定账户发起扣款。",
      clauseLocation: "授权书 第 2 条",
      reason: "授权范围较宽，且使用了“不可撤销”表述，需要确认取消和更换银行卡的流程。",
      possibleConsequence: "账户内资金可能在约定还款日被自动划扣，取消授权可能较为困难。",
      questionToAsk: "自动扣款授权能否取消，扣款失败或重复扣款如何处理？",
    },
  ],
  overallResult: {
    level: "verify",
    summary: "该合同真实年化成本较高，并存在提前还款费用和自动扣款授权。",
  },
  questionList: [
    "服务费是否已经计入展示的年化利率？",
    "提前还款需要支付哪些费用，是否存在减免条件？",
    "自动扣款授权是否可以取消或更换银行卡？",
    "逾期后是否同时收取罚息和违约金？",
  ],
});
