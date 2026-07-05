INSERT OR REPLACE INTO risk_rules
(rule_id, rule_name, category, condition, risk_level, weight, legal_basis, created_at, updated_at)
VALUES
('RR001', '费用不透明', 'cost_transparency', '{"field":"data.costAnalysis.additionalFees","operator":">","value":0}', 'high', 25, '《中国人民银行公告〔2021〕第3号》要求贷款产品明示年化利率并纳入相关费用。', '2026-07-04T00:00:00+08:00', '2026-07-04T00:00:00+08:00'),
('RR002', '真实年化偏高', 'interest_fee', '{"field":"data.costAnalysis.realAnnualRate","operator":">","value":24}', 'high', 25, '贷款年化利率应以对借款人收取的全部贷款成本与实际占用本金比例计算。', '2026-07-04T00:00:00+08:00', '2026-07-04T00:00:00+08:00'),
('RR003', '提前还款限制', 'prepayment', '{"field":"data.contractSummary.prepaymentRule","operator":"contains_any","value":["手续费","违约金"]}', 'medium', 15, '《民法典》第677条规定借款人提前返还借款的，除另有约定外应按实际借款期间计算利息。', '2026-07-04T00:00:00+08:00', '2026-07-04T00:00:00+08:00'),
('RR004', '砍头息', 'cost_transparency', '{"left":"data.contractSummary.actualReceivedAmount","operator":"<","right":"data.contractSummary.loanAmount"}', 'high', 20, '《民法典》第670条禁止利息预先在本金中扣除。', '2026-07-04T00:00:00+08:00', '2026-07-04T00:00:00+08:00'),
('RR005', '自动续费/扣款', 'authorization_privacy', '{"clauses_contains_any":["自动续费","自动扣款","扣款授权"]}', 'medium', 15, '《消费者权益保护法实施条例》第10条要求自动续费等服务以显著方式提请消费者注意。', '2026-07-04T00:00:00+08:00', '2026-07-04T00:00:00+08:00'),
('RR006', '担保责任不清', 'other', '{"clauses_contains_all":["担保"],"clauses_contains_any":["连带责任","保证责任","责任不清"]}', 'medium', 10, '《民法典》第686条对保证方式约定不明的责任承担作出规定。', '2026-07-04T00:00:00+08:00', '2026-07-04T00:00:00+08:00'),
('RR007', '逾期罚息过高', 'overdue', '{"field":"data.contractSummary.overdueFee","operator":"contains_any","value":["1.5倍","高额违约金","违约金"]}', 'medium', 10, '违约责任应与实际损失、合同约定和公平原则相匹配。', '2026-07-04T00:00:00+08:00', '2026-07-04T00:00:00+08:00'),
('RR008', '捆绑销售', 'other', '{"clauses_contains_any":["强制购买","捆绑","搭售","保险费"]}', 'medium', 10, '《银行保险机构消费者权益保护管理办法》要求不得强制捆绑、强制搭售产品或服务。', '2026-07-04T00:00:00+08:00', '2026-07-04T00:00:00+08:00');
