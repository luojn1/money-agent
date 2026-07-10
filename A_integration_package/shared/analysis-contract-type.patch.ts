// 将 shared/analysis.ts 中 ContractType 替换为以下定义。
// 这是必须合并的公共类型改动；否则 B 无法把新场景作为 contractType 输出。
export type ContractType =
  | "consumer_loan"
  | "cash_installment"
  | "bill_installment"
  | "merchant_installment"
  | "credit_card_installment"
  | "education_training_loan"
  | "unknown";

