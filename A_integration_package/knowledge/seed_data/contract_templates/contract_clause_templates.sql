CREATE TABLE IF NOT EXISTS contract_clause_templates (
  template_id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  template_name TEXT NOT NULL,
  keyword_patterns TEXT NOT NULL,
  typical_clause_structure TEXT NOT NULL,
  field_mapping TEXT NOT NULL,
  risk_indicators TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR REPLACE INTO contract_clause_templates
(template_id, scenario_id, contract_type, template_name, keyword_patterns, typical_clause_structure, field_mapping, risk_indicators, created_at, updated_at)
VALUES
(
  'tpl_credit_card_installment_001',
  'credit_card_installment',
  'credit_card_installment',
  '信用卡分期协议通用模板',
  '["信用卡分期","账单分期","消费分期","分期手续费","信用卡账单","分期还款"]',
  '["分期金额","期数","手续费率","提前还款规则"]',
  '{"installment_amount":["分期金额","账单金额","消费金额","本金"],"installment_periods":["分期期数","期数","分为","共"],"service_fee_rate":["手续费率","每期手续费","分期手续费率"],"prepayment_rule":["提前还款","提前结清","手续费退还"]}',
  '["免息","手续费","提前结清手续费不退","最低还款额","循环利息"]',
  '2026-07-09',
  '2026-07-09'
),
(
  'tpl_education_training_loan_001',
  'education_training_loan',
  'education_training_loan',
  '教育培训贷合同通用模板',
  '["培训贷","教育分期","学费分期","课程贷款","培训机构","技能培训"]',
  '["培训服务内容","贷款金额","服务绑定说明","退费条款"]',
  '{"training_course":["培训课程","课程服务","教育服务","技能培训"],"loan_amount":["贷款金额","学费金额","培训费","课程费用"],"service_binding":["服务合同","贷款合同","绑定","专项用于支付"],"refund_policy":["退课","退费","退款","解除合同"]}',
  '["包就业","就业承诺","退课不退费","机构不承担","贷款合同继续履行"]',
  '2026-07-09',
  '2026-07-09'
);

