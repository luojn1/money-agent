INSERT OR REPLACE INTO contract_clause_templates
(template_id, contract_type, clause_category, common_patterns, field_mapping, risk_indicators)
VALUES
('TPL001', '消费贷', 'interest_fee', '["服务费","管理费","咨询费","费用由放款金额中扣除"]', '{"additionalFees":"data.costAnalysis.additionalFees"}', '["一次性扣除","未明示","综合费用"]'),
('TPL002', '消费贷', 'prepayment', '["提前结清","提前还款","剩余本金"]', '{"prepaymentRule":"data.contractSummary.prepaymentRule"}', '["手续费","违约金","不退还"]'),
('TPL003', '信用卡分期', 'interest_fee', '["免息","分期手续费","每期手续费"]', '{"nominalRate":"data.contractSummary.nominalRate"}', '["免息不免费","手续费"]'),
('TPL004', '通用', 'authorization_privacy', '["自动扣款","扣款授权","绑定账户"]', '{"clauses":"data.clauses"}', '["不可撤销","默认授权","自动续费"]'),
('TPL005', '通用', 'overdue', '["逾期罚息","违约金","滞纳金"]', '{"overdueFee":"data.contractSummary.overdueFee"}', '["1.5倍","高额","复利"]');
