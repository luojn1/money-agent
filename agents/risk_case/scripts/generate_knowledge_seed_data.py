"""Generate expanded knowledge seed data in SQL, CSV, and JSON formats."""

from __future__ import annotations

import csv
import json
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "knowledge" / "seed_data"
TODAY = "2026-07-04"


def sql_value(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    text = json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else str(value)
    return "'" + text.replace("'", "''") + "'"


def write_dataset(folder: str, table: str, key: str, rows: list[dict[str, Any]], columns: list[str]) -> None:
    target = OUT / folder
    target.mkdir(parents=True, exist_ok=True)
    (target / f"{folder}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    with (target / f"{folder}.csv").open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({column: json.dumps(row.get(column), ensure_ascii=False) if isinstance(row.get(column), (dict, list)) else row.get(column, "") for column in columns})

    values = []
    for row in rows:
        values.append("(" + ", ".join(sql_value(row.get(column)) for column in columns) + ")")
    sql = f"INSERT OR REPLACE INTO {table} ({', '.join(columns)}) VALUES\n" + ",\n".join(values) + ";\n"
    (target / f"{folder}.sql").write_text(sql, encoding="utf-8")


def rule(rule_id: int, name: str, category: str, condition: dict[str, Any], level: str, weight: int, basis: str, question: str) -> dict[str, Any]:
    return {
        "rule_id": f"RR{rule_id:03d}",
        "rule_name": name,
        "category": category,
        "condition": condition,
        "risk_level": level,
        "weight": weight,
        "legal_basis": basis,
        "question_to_ask": question,
        "created_at": TODAY,
        "updated_at": TODAY,
        "version": 1,
        "effective_date": TODAY,
        "expiry_date": "",
        "is_active": 1,
        "source": "seed",
        "source_url": "",
        "imported_at": TODAY,
        "review_status": "approved",
    }


def build_risk_rules() -> list[dict[str, Any]]:
    items = [
        ("费用不透明-存在额外费用", "cost_transparency", {"field": "data.costAnalysis.additionalFees", "operator": ">", "value": 0}, "high", 24, "中国人民银行公告〔2021〕第3号；《民法典》第496条", "请机构列明所有费用项目，并说明是否计入明示年化利率。"),
        ("服务费一次性扣除", "cost_transparency", {"clauses_contains_any": ["服务费", "一次性扣除", "放款金额中扣除"]}, "high", 22, "《民法典》第670条；《关于进一步规范信贷融资收费降低企业融资综合成本的通知》", "请机构说明服务费扣除依据、金额和是否属于变相预扣利息。"),
        ("管理费未纳入成本", "cost_transparency", {"clauses_contains_any": ["管理费", "账户管理", "贷后管理费"]}, "medium", 14, "中国人民银行公告〔2021〕第3号", "请机构说明管理费是否纳入综合融资成本和真实年化利率。"),
        ("咨询费或顾问费异常", "cost_transparency", {"clauses_contains_any": ["咨询费", "顾问费", "信息服务费"]}, "medium", 14, "《消费者权益保护法》第8条", "请机构说明咨询服务的具体内容、定价依据和取消方式。"),
        ("担保费或保证金另收", "cost_transparency", {"clauses_contains_any": ["担保费", "保证金", "履约保证"]}, "medium", 16, "《民法典》合同编；金融消费者权益保护规则", "请机构说明担保费是否必要、是否可退、是否影响贷款审批。"),
        ("保险费疑似强制", "cost_transparency", {"clauses_contains_any": ["保险费", "保障服务费", "必须购买保险"]}, "medium", 15, "《银行保险机构消费者权益保护管理办法》", "请机构说明保险是否自愿购买，取消后是否影响贷款。"),
        ("砍头息-到账低于本金", "cost_transparency", {"left": "data.contractSummary.actualReceivedAmount", "operator": "<", "right": "data.contractSummary.loanAmount"}, "high", 25, "《民法典》第670条", "请机构说明实际到账金额低于合同本金的原因和扣费依据。"),
        ("费用名称模糊", "cost_transparency", {"clauses_contains_any": ["其他费用", "相关费用", "综合费用", "平台费用"]}, "medium", 12, "《民法典》第496条；《消费者权益保护法》第8条", "请机构逐项解释费用名称、金额、收取时间和退费条件。"),
        ("名义免息但有手续费", "interest_fee", {"clauses_contains_all": ["免息"], "clauses_contains_any": ["手续费", "服务费", "分期费"]}, "high", 23, "中国人民银行公告〔2021〕第3号", "请机构把手续费折算为真实年化成本并书面说明。"),
        ("真实年化超过24%", "interest_fee", {"field": "data.costAnalysis.realAnnualRate", "operator": ">", "value": 24}, "high", 25, "最高人民法院民间借贷利率司法政策；金融消费者权益保护规则", "请机构说明真实年化利率计算口径和是否包含全部费用。"),
        ("真实年化超过36%", "interest_fee", {"field": "data.costAnalysis.realAnnualRate", "operator": ">", "value": 36}, "high", 35, "最高人民法院关于民间借贷案件适用法律若干问题的规定", "请机构说明是否存在超过司法保护上限的利息或费用。"),
        ("真实年化高于名义利率10个百分点", "interest_fee", {"left": "data.costAnalysis.realAnnualRate", "operator": ">", "right": "data.contractSummary.nominalRate", "delta": 10}, "high", 22, "中国人民银行公告〔2021〕第3号", "请机构解释名义利率和真实年化差异的来源。"),
        ("IRR口径未披露", "interest_fee", {"clauses_contains_any": ["IRR", "内部收益率", "折算年化"], "clauses_not_contains_any": ["计算公式", "现金流"]}, "medium", 12, "中国人民银行公告〔2021〕第3号", "请机构提供IRR现金流、计算公式和费用纳入口径。"),
        ("日利率月利率混用", "interest_fee", {"clauses_contains_any": ["日利率", "月利率", "按日计息"]}, "medium", 10, "《消费者权益保护法》第8条", "请机构把日利率、月利率统一折算成年化利率。"),
        ("LPR倍数偏高", "interest_fee", {"field": "data.costAnalysis.realAnnualRate", "operator": ">", "value": 15}, "medium", 12, "贷款市场报价利率管理规则；中国人民银行公告〔2021〕第3号", "请机构说明该产品利率相对同期LPR的倍数和定价依据。"),
        ("复利或利滚利表述", "interest_fee", {"clauses_contains_any": ["复利", "利滚利", "按月复计"]}, "high", 22, "《民法典》公平原则；金融消费者权益保护规则", "请机构说明是否对利息、罚息再计息。"),
        ("提前还款收手续费", "prepayment", {"field": "data.contractSummary.prepaymentRule", "operator": "contains_any", "value": ["手续费", "提前结清费", "提前还款手续费"]}, "medium", 15, "《民法典》第677条", "请机构说明提前结清费用计算方式和已收费用退还规则。"),
        ("提前还款收违约金", "prepayment", {"field": "data.contractSummary.prepaymentRule", "operator": "contains_any", "value": ["违约金", "补偿金"]}, "medium", 15, "《民法典》第677条", "请机构说明提前还款违约金上限和减免费条件。"),
        ("提前还款需审批", "prepayment", {"field": "data.contractSummary.prepaymentRule", "operator": "contains_any", "value": ["需审批", "经同意", "申请通过", "批准", "决定是否批准"]}, "medium", 10, "《民法典》第677条", "请机构说明审批标准、处理时限和拒绝提前还款的依据。"),
        ("提前还款仍收全期利息", "prepayment", {"clauses_contains_any": ["仍按全部期限计收", "已收利息不退", "剩余利息照收"]}, "high", 22, "《民法典》第677条", "请机构说明提前还款后利息是否按实际借款期间计算。"),
        ("逾期罚息1.5倍", "overdue", {"field": "data.contractSummary.overdueFee", "operator": "contains_any", "value": ["1.5倍", "150%"]}, "medium", 12, "金融借款合同监管规则；金融消费者权益保护规则", "请机构说明逾期罚息上限、计收基数和是否重复计收。"),
        ("高额违约金", "overdue", {"field": "data.contractSummary.overdueFee", "operator": "contains_any", "value": ["高额违约金", "违约金"]}, "medium", 12, "《民法典》第585条", "请机构说明违约金计算方式和是否可按实际损失调整。"),
        ("还款方式模糊", "repayment", {"field": "data.contractSummary.repaymentMethod", "operator": "contains_any", "value": ["不详", "约定方式", "另行通知", ""]}, "medium", 10, "《民法典》第496条", "请机构明确还款方式、期数、每期金额和还款日。"),
        ("最低还款误导", "repayment", {"clauses_contains_any": ["最低还款", "只需还最低", "循环利息"]}, "medium", 12, "《消费者权益保护法》第8条", "请机构说明最低还款后的利息、复利和还款周期。"),
        ("格式条款未提示", "dispute_resolution", {"clauses_contains_any": ["本合同为格式合同", "格式条款"], "clauses_not_contains_any": ["特别提示", "加粗", "显著提示"]}, "medium", 14, "《民法典》第496条", "请机构说明是否已对重要格式条款进行显著提示和说明。"),
        ("单方变更条款", "dispute_resolution", {"clauses_contains_any": ["有权单方调整", "无需另行通知", "平台可变更", "有权对服务规则", "收费标准及业务流程进行调整"]}, "high", 20, "《民法典》第497条；《消费者权益保护法》第26条", "请机构说明哪些内容可单方变更，以及消费者是否有拒绝或解除权。"),
        ("免责条款过宽", "dispute_resolution", {"clauses_contains_any": ["不承担任何责任", "概不负责", "免责"]}, "high", 20, "《民法典》第497条", "请机构说明免责条款是否排除或限制消费者主要权利。"),
        ("管辖法院不便利", "dispute_resolution", {"clauses_contains_any": ["由贷款人所在地法院管辖", "平台所在地法院", "仲裁委员会"]}, "low", 8, "《民事诉讼法》协议管辖规则", "请机构说明争议解决地点和维权成本。"),
        ("自动扣款授权过宽", "authorization_privacy", {"clauses_contains_any": ["自动扣款", "代扣", "委托扣款"]}, "medium", 15, "《消费者权益保护法实施条例》第10条", "请机构说明扣款授权范围、期限、取消方式和失败处理。"),
        ("自动续费提示不足", "authorization_privacy", {"clauses_contains_any": ["自动续费", "自动展期"], "clauses_not_contains_any": ["提前提醒", "取消方式"]}, "medium", 15, "《消费者权益保护法实施条例》第10条", "请机构说明续费前提醒方式和取消入口。"),
        ("征信授权范围过宽", "authorization_privacy", {"clauses_contains_any": ["征信授权", "报送征信", "查询征信", "征信机构"]}, "high", 20, "《征信业管理条例》；《个人信息保护法》", "请机构说明征信查询和报送的目的、范围、期限及撤回方式。"),
        ("信息共享范围过宽", "authorization_privacy", {"clauses_contains_any": ["关联公司共享", "合作伙伴共享", "第三方共享", "关联公司", "第三方平台", "提供给"]}, "high", 20, "《个人信息保护法》第13条、第23条", "请机构列明共享对象、目的、字段和用户拒绝方式。"),
        ("担保连带责任", "other", {"clauses_contains_any": ["连带责任", "连带保证"]}, "high", 22, "《民法典》担保制度相关规定", "请机构说明担保责任范围、期限、触发条件和是否为连带责任。"),
        ("担保范围含全部费用", "other", {"clauses_contains_all": ["担保"], "clauses_contains_any": ["全部债务", "律师费", "实现债权费用"]}, "medium", 15, "《民法典》担保制度相关规定", "请机构列明担保覆盖的本金、利息、罚息和实现债权费用。"),
        ("保证期间不清", "other", {"clauses_contains_all": ["保证"], "clauses_not_contains_any": ["保证期间", "担保期限"]}, "medium", 12, "《民法典》保证合同规则", "请机构明确保证期间和责任终止条件。"),
        ("抵押物处置授权过宽", "other", {"clauses_contains_any": ["抵押物", "质押物", "处置抵押"]}, "medium", 14, "《民法典》物权编", "请机构说明抵押物处置条件、评估方式和剩余价款返还。"),
        ("贷款搭售保险", "other", {"clauses_contains_any": ["贷款需购买保险", "保险为放款条件", "保障服务"]}, "medium", 16, "《银行保险机构消费者权益保护管理办法》", "请机构说明保险是否为自愿选择及取消后是否影响贷款。"),
        ("贷款搭售会员服务", "other", {"clauses_contains_any": ["会员费", "权益包", "增值服务"]}, "medium", 14, "《消费者权益保护法》第9条", "请机构说明会员服务是否可单独取消并退费。"),
        ("贷款搭售评估服务", "other", {"clauses_contains_any": ["评估费", "审核费", "资料服务费"]}, "medium", 12, "《关于进一步规范信贷融资收费降低企业融资综合成本的通知》", "请机构说明评估服务内容、必要性和收费依据。"),
        ("强制购买第三方服务", "other", {"clauses_contains_any": ["强制购买", "必须开通", "捆绑", "搭售"]}, "high", 20, "《消费者权益保护法》第9条", "请机构说明消费者是否可拒绝第三方服务。"),
        ("个人信息收集过度", "authorization_privacy", {"clauses_contains_any": ["通讯录", "定位", "相册", "设备信息"]}, "high", 20, "《个人信息保护法》第6条", "请机构说明收集这些信息的必要性和最小范围。"),
        ("敏感个人信息处理", "authorization_privacy", {"clauses_contains_any": ["身份证照片", "人脸识别", "生物识别", "银行卡信息"]}, "high", 22, "《个人信息保护法》第28条、第29条", "请机构说明敏感个人信息处理的单独同意和保护措施。"),
        ("个人信息保存期限不明", "authorization_privacy", {"clauses_contains_any": ["长期保存", "永久保存", "保存期限", "继续有效"]}, "medium", 10, "《个人信息保护法》第19条", "请机构说明个人信息保存期限和删除路径。"),
        ("营销授权默认同意", "authorization_privacy", {"clauses_contains_any": ["营销短信", "商业推广", "默认同意"]}, "low", 8, "《个人信息保护法》；《消费者权益保护法》", "请机构说明营销授权是否可单独拒绝和撤回。"),
        ("催收联系人披露", "overdue", {"clauses_contains_any": ["联系紧急联系人", "通知亲友", "联系单位", "紧急联系人"]}, "high", 20, "金融消费者权益保护和催收行为规范", "请机构说明逾期催收是否会向无关第三人披露债务信息。"),
        ("暴力催收或威胁性措辞", "overdue", {"clauses_contains_any": ["上门施压", "公开曝光", "威胁", "骚扰"]}, "high", 24, "《个人信息保护法》；金融催收自律规范", "请机构承诺不得骚扰、威胁或向无关人员披露信息。"),
        ("催收费用另收", "overdue", {"clauses_contains_any": ["催收费", "外访费", "催告费", "催收服务费", "催收费用"]}, "medium", 12, "《民法典》第585条；金融消费者权益保护规则", "请机构说明催收费用的合法依据和计算上限。"),
        ("退费条件苛刻", "repayment", {"clauses_contains_any": ["不予退费", "概不退款", "退费需扣除"]}, "medium", 15, "《消费者权益保护法》；《民法典》合同解除规则", "请机构说明退费条件、扣费项目和处理时限。"),
        ("解约成本过高", "repayment", {"clauses_contains_any": ["解约金", "退出费", "解除合同费用"]}, "medium", 14, "《民法典》第563条、第585条", "请机构说明解约成本是否与实际损失相匹配。"),
        ("服务合同解除但贷款继续", "repayment", {"clauses_contains_any": ["服务解除", "贷款仍需偿还", "合作商户"]}, "high", 22, "《消费者权益保护法》；金融消费者权益保护规则", "请机构说明服务失败或退费时贷款合同如何同步处理。"),
        ("冷静期缺失", "repayment", {"clauses_contains_any": ["培训贷", "医美分期", "服务分期"], "clauses_not_contains_any": ["冷静期", "无理由解除"]}, "low", 8, "消费者权益保护规则", "请机构说明是否提供冷静期或签约后的撤销路径。"),
        ("还款日变更通知不足", "repayment", {"clauses_contains_any": ["调整还款日", "变更扣款日"], "clauses_not_contains_any": ["提前通知"]}, "low", 8, "《消费者权益保护法》第8条", "请机构说明还款日调整是否提前通知并允许用户确认。"),
        ("变更默示同意", "dispute_resolution", {"clauses_contains_all": ["提出书面异议", "视为接受"]}, "high", 18, "《民法典》第497条；《消费者权益保护法》第26条", "请机构说明用户未及时异议即视为同意的依据和救济路径。"),
        ("不同意变更需立即结清", "dispute_resolution", {"clauses_contains_all": ["不同意", "立即结清"]}, "high", 18, "《民法典》第497条；金融消费者权益保护规则", "请机构说明不同意变更时是否可继续按原合同履行或分期退出。"),
        ("加速到期条款", "overdue", {"clauses_contains_any": ["剩余借款立即到期", "立即偿还全部剩余本金", "宣布全部剩余借款立即到期"]}, "high", 20, "《民法典》合同编；金融消费者权益保护规则", "请机构说明加速到期的触发条件、通知方式和申诉期限。"),
        ("任一期逾期触发解除", "overdue", {"clauses_contains_all": ["任一期", "逾期"]}, "high", 18, "《民法典》第563条；金融消费者权益保护规则", "请机构说明单期逾期即解除合同是否有宽限期和补救路径。"),
        ("主观违约判断", "repayment", {"clauses_contains_any": ["还款能力明显下降", "认为乙方的还款能力"]}, "medium", 14, "《民法典》第496条；《消费者权益保护法》第26条", "请机构说明主观判断违约的客观标准和申诉材料。"),
        ("电子送达范围过宽", "dispute_resolution", {"clauses_contains_any": ["作为送达方式", "电子邮件", "App 站内通知"]}, "medium", 12, "民事诉讼送达规则；金融消费者权益保护规则", "请机构说明电子送达的确认机制和未收到通知时的补救方式。"),
        ("旧联系方式视为有效送达", "dispute_resolution", {"clauses_contains_any": ["有效送达地址", "原联系方式仍视为有效"]}, "medium", 12, "民事诉讼送达规则；金融消费者权益保护规则", "请机构说明联系方式变更后的通知责任和送达异议路径。"),
        ("撤回授权影响服务", "authorization_privacy", {"clauses_contains_all": ["撤回授权", "暂停或终止"]}, "medium", 12, "《个人信息保护法》第15条、第16条", "请机构说明撤回非必要授权后是否仍能继续履行借款合同。"),
        ("浏览和交易数据收集", "authorization_privacy", {"clauses_contains_any": ["网络浏览记录", "第三方平台产生的账户和交易信息"]}, "high", 18, "《个人信息保护法》第6条、第13条", "请机构说明浏览记录、平台交易信息的必要性、范围和保存期限。"),
        ("还款冲抵顺序不利", "repayment", {"clauses_contains_all": ["还款顺序", "本金"]}, "medium", 12, "《消费者权益保护法》第8条；金融消费者权益保护规则", "请机构说明还款优先冲抵费用和利息时对本金减少的影响。"),
        ("持续自动扣款", "authorization_privacy", {"clauses_contains_any": ["持续发起扣款", "直至应付款项全部结清"]}, "medium", 12, "《消费者权益保护法实施条例》第10条", "请机构说明持续扣款授权的次数、期限、取消方式和异常扣款处理。"),
        ("超额转款不视为提前还款", "prepayment", {"clauses_contains_any": ["超额款项不视为提前还款", "不视为提前还款申请"]}, "medium", 10, "《民法典》第677条；金融消费者权益保护规则", "请机构说明用户主动多还款的处理规则和退回路径。"),
    ]
    rows = []
    for idx, item in enumerate(items, start=1):
        rows.append(rule(idx, *item))
    return rows


def build_regulations() -> list[dict[str, Any]]:
    titles = [
        ("LAW001", "《民法典》第496条", "全国人民代表大会", "2020-05-28", "2021-01-01", "格式条款提供方应履行提示说明义务，免除或减轻自身责任、加重对方责任、限制对方主要权利的条款应以显著方式提示。", "格式条款,提示说明,费用披露,免责条款"),
        ("LAW002", "《民法典》第497条", "全国人民代表大会", "2020-05-28", "2021-01-01", "不合理免除或者减轻责任、加重对方责任、限制主要权利的格式条款可能无效。", "格式条款,单方变更,免责,消费者权利"),
        ("LAW003", "《民法典》第509条", "全国人民代表大会", "2020-05-28", "2021-01-01", "当事人应按照约定全面履行义务，并遵循诚信原则。", "诚信履约,合同履行,信息披露"),
        ("LAW004", "《民法典》第563条", "全国人民代表大会", "2020-05-28", "2021-01-01", "符合法定情形时当事人可以解除合同。", "合同解除,退费,服务失败"),
        ("LAW005", "《民法典》第585条", "全国人民代表大会", "2020-05-28", "2021-01-01", "约定违约金过分高于造成损失的，人民法院或仲裁机构可以予以调整。", "违约金,逾期,解约金"),
        ("LAW006", "《民法典》第670条", "全国人民代表大会", "2020-05-28", "2021-01-01", "借款利息不得预先在本金中扣除，预先扣除的应按实际借款数额返还并计算利息。", "砍头息,预扣利息,实际到账"),
        ("LAW007", "《民法典》第677条", "全国人民代表大会", "2020-05-28", "2021-01-01", "借款人提前返还借款的，除另有约定外应按实际借款期间计算利息。", "提前还款,提前结清,利息计算"),
        ("LAW008", "《消费者权益保护法》第8条", "全国人大常委会", "2013-10-25", "2014-03-15", "消费者享有知悉其购买、使用商品或接受服务真实情况的权利。", "知情权,费用披露,真实成本"),
        ("LAW009", "《消费者权益保护法》第9条", "全国人大常委会", "2013-10-25", "2014-03-15", "消费者享有自主选择商品或者服务的权利。", "自主选择,捆绑销售,搭售"),
        ("LAW010", "《消费者权益保护法》第26条", "全国人大常委会", "2013-10-25", "2014-03-15", "经营者不得以格式条款等方式排除或者限制消费者权利、减轻或免除经营者责任。", "格式条款,免责,不公平条款"),
        ("LAW011", "《个人信息保护法》第6条", "全国人大常委会", "2021-08-20", "2021-11-01", "处理个人信息应具有明确、合理目的，并限于实现处理目的的最小范围。", "个人信息,最小必要,过度收集"),
        ("LAW012", "《个人信息保护法》第13条", "全国人大常委会", "2021-08-20", "2021-11-01", "处理个人信息应具备合法性基础，如取得个人同意或为订立、履行合同所必需。", "个人信息授权,合法基础,同意"),
        ("LAW013", "《个人信息保护法》第23条", "全国人大常委会", "2021-08-20", "2021-11-01", "向其他个人信息处理者提供个人信息的，应告知接收方名称、处理目的、方式和种类。", "信息共享,第三方,关联公司"),
        ("LAW014", "《个人信息保护法》第28条", "全国人大常委会", "2021-08-20", "2021-11-01", "生物识别、金融账户等属于敏感个人信息，处理应有特定目的和充分必要性。", "敏感个人信息,人脸识别,银行卡"),
        ("LAW015", "《个人信息保护法》第29条", "全国人大常委会", "2021-08-20", "2021-11-01", "处理敏感个人信息应取得个人的单独同意。", "单独同意,敏感信息,授权"),
        ("LAW016", "《征信业管理条例》", "国务院", "2013-01-21", "2013-03-15", "征信机构采集、查询、使用个人信用信息应依法进行并保护信息主体权益。", "征信授权,征信查询,信用记录"),
        ("LAW017", "《消费者权益保护法实施条例》第10条", "国务院", "2024-03-15", "2024-07-01", "经营者采取自动展期、自动续费等方式提供服务的，应以显著方式提请消费者注意。", "自动续费,自动扣款,显著提示"),
        ("LAW018", "《电子商务法》第19条", "全国人大常委会", "2018-08-31", "2019-01-01", "电子商务经营者搭售商品或服务，应以显著方式提请消费者注意，不得作为默认同意选项。", "搭售,默认勾选,平台服务"),
        ("LAW019", "《银行保险机构消费者权益保护管理办法》", "原银保监会", "2022-12-26", "2023-03-01", "要求银行保险机构保护消费者知情权、自主选择权、公平交易权和个人信息安全权。", "金融消费者,知情权,自主选择,信息保护"),
        ("LAW020", "《金融消费者权益保护实施办法》", "中国人民银行", "2020-09-15", "2020-11-01", "金融机构应充分披露金融产品和服务重要内容，不得进行误导性宣传。", "金融消费者,信息披露,误导宣传"),
        ("LAW021", "中国人民银行公告〔2021〕第3号", "中国人民银行", "2021-03-31", "2021-03-31", "所有从事贷款业务的机构应以明显方式向借款人展示年化利率。", "年化利率,真实成本,IRR"),
        ("LAW022", "《消费金融公司管理办法》", "国家金融监督管理总局", "2024-03-18", "2024-04-18", "规范消费金融公司经营行为、消费者保护、风险管理和合作机构管理。", "消费金融公司,贷款,风险管理"),
        ("LAW023", "《商业银行互联网贷款管理暂行办法》", "原银保监会", "2020-07-12", "2020-07-17", "规范商业银行互联网贷款的风险管理、合作机构和消费者保护要求。", "互联网贷款,银行消费贷,合作机构"),
        ("LAW024", "《关于规范整顿“现金贷”业务的通知》", "互联网金融风险专项整治工作领导小组办公室等", "2017-12-01", "2017-12-01", "要求规范现金贷业务，禁止暴力催收、砍头息和畸高利率。", "现金贷,砍头息,暴力催收"),
        ("LAW025", "《关于进一步规范信贷融资收费降低企业融资综合成本的通知》", "原银保监会等", "2020-06-01", "2020-06-01", "规范信贷环节收费，要求不得违规转嫁成本或强制搭售。", "信贷收费,搭售,服务费"),
        ("LAW026", "最高人民法院关于审理民间借贷案件适用法律若干问题的规定", "最高人民法院", "2020-08-20", "2020-08-20", "明确民间借贷利率司法保护规则，并对预扣利息、复利等作出规范。", "民间借贷,利率上限,复利"),
        ("LAW027", "最高人民法院关于适用《民法典》有关担保制度的解释", "最高人民法院", "2020-12-31", "2021-01-01", "细化保证、抵押、质押等担保制度裁判规则。", "担保,连带责任,保证期间"),
        ("LAW028", "《金融机构客户尽职调查和客户身份资料及交易记录保存管理办法》", "中国人民银行等", "2022-01-19", "2022-03-01", "金融机构应依法开展客户身份识别和资料保存。", "身份识别,资料保存,个人信息"),
        ("LAW029", "《网络安全法》", "全国人大常委会", "2016-11-07", "2017-06-01", "网络运营者收集、使用个人信息应遵循合法、正当、必要原则。", "网络平台,个人信息,数据安全"),
        ("LAW030", "《数据安全法》", "全国人大常委会", "2021-06-10", "2021-09-01", "规范数据处理活动，保障数据安全和合法利用。", "数据安全,平台数据,风控"),
        ("LAW031", "《优化营商环境条例》", "国务院", "2019-10-22", "2020-01-01", "行政机关和市场主体应依法保护市场主体和消费者合法权益。", "营商环境,收费规范,公开透明"),
        ("LAW032", "《汽车金融公司管理办法》", "国家金融监督管理总局", "2023-07-11", "2023-08-11", "规范汽车金融公司业务范围、风险管理和消费者权益保护。", "车贷,汽车金融,融资租赁"),
    ]
    return [
        {
            "regulation_id": rid,
            "title": title,
            "issuing_body": body,
            "issue_date": issue,
            "effective_date": effective,
            "status": "有效",
            "summary": summary,
            "full_text": summary,
            "keywords": keywords,
            "source_url": "",
            "applicable_scenarios": keywords,
            "version": 1,
            "expiry_date": "",
            "is_active": 1,
            "source": "seed",
            "imported_at": TODAY,
            "review_status": "approved",
        }
        for rid, title, body, issue, effective, summary, keywords in titles
    ]


def build_cases() -> list[dict[str, Any]]:
    scenarios = [
        ("医美分期", "cost_transparency", "医美分期零利息但服务费另收", "用户办理医美分期时被宣传零利息，合同另列服务费、咨询费或平台费，真实成本高于宣传。"),
        ("医美分期", "repayment", "医美服务未完成仍被要求还款", "医美机构未完成服务或效果争议，贷款平台仍按期扣款。"),
        ("教育培训贷", "repayment", "培训机构停课后贷款继续", "培训机构经营异常，用户无法上课但贷款合同仍要求继续还款。"),
        ("教育培训贷", "cost_transparency", "培训贷手续费披露不足", "课程顾问强调低月供，未充分说明分期服务费和退课扣费。"),
        ("信用卡分期", "interest_fee", "信用卡分期免息手续费陷阱", "银行或平台宣传免息分期，但每期手续费折算年化较高。"),
        ("信用卡分期", "repayment", "最低还款导致循环利息", "用户长期只还最低还款额，产生循环利息和复利感知落差。"),
        ("消费贷", "cost_transparency", "消费贷预扣服务费", "放款时先扣服务费或担保费，实际到账少于合同本金。"),
        ("消费贷", "overdue", "逾期罚息和违约金叠加", "用户逾期后被同时收取罚息、违约金、催收费。"),
        ("保险纠纷", "other", "贷款搭售保险退保损失", "贷款签署时被引导购买保险，退保时产生较高扣费。"),
        ("租赁贷", "repayment", "租房贷退租后仍需还款", "租赁公司停止服务或提前退租，用户仍被贷款平台催收。"),
        ("汽车融资租赁", "other", "融资租赁提前解约成本高", "车辆融资租赁合同中约定高额提前解约金和处置费用。"),
        ("互联网平台贷", "authorization_privacy", "平台自动扣款争议", "用户解绑银行卡或关闭服务后仍被代扣，取消入口不清晰。"),
        ("互联网平台贷", "interest_fee", "平台借款真实年化不明显", "页面突出日利率或低月供，未直观展示综合年化成本。"),
        ("P2P网贷", "overdue", "历史网贷暴力催收", "平台或外包催收联系亲友、单位，造成名誉和生活影响。"),
        ("现金贷", "cost_transparency", "短期现金贷砍头息", "短期借款先扣服务费，到手金额低但按合同本金计息。"),
    ]
    rows = []
    for i in range(1, 56):
        scenario, risk_type, base_title, desc = scenarios[(i - 1) % len(scenarios)]
        rows.append(
            {
                "case_id": f"CASE{i:03d}",
                "title": f"{base_title}案例{i:02d}",
                "scenario": scenario,
                "risk_type": risk_type,
                "description": desc + f" 本案例为消费金融纠纷知识库中的典型化案例，用于匹配相似风险场景。",
                "dispute_point": "费用是否充分披露、合同责任是否公平、服务失败后贷款责任如何处理。",
                "user_loss": "多支付费用、退费困难、逾期压力或征信受影响。",
                "handling_result": "经投诉、调解或协商后，机构补充披露费用、减免部分费用或重新协商还款。",
                "rights_path": "保留合同、扣款记录、宣传页面和沟通记录，先向机构书面投诉，再向消协、金融监管或法院/仲裁渠道维权。",
                "source_url": f"https://example.com/consumer-finance-cases/{i:03d}",
                "embedding": "",
                "version": 1,
                "effective_date": TODAY,
                "expiry_date": "",
                "is_active": 1,
                "source": "seed",
                "imported_at": TODAY,
                "review_status": "approved",
            }
        )
    return rows


def build_templates() -> list[dict[str, Any]]:
    names = [
        ("消费贷合同", "费用条款", ["服务费", "管理费", "综合费用", "一次性扣除"], {"additionalFees": "costAnalysis.additionalFees"}, ["费用", "扣除", "服务费"]),
        ("消费贷合同", "利率条款", ["年化利率", "月利率", "日利率", "IRR"], {"realAnnualRate": "costAnalysis.realAnnualRate"}, ["真实年化", "名义利率"]),
        ("消费贷合同", "提前还款条款", ["提前结清", "提前还款", "手续费", "违约金"], {"prepaymentRule": "contractSummary.prepaymentRule"}, ["提前", "结清"]),
        ("信用卡分期协议", "手续费条款", ["分期手续费", "免息", "每期费率"], {"feeRate": "costAnalysis.additionalFees"}, ["免息", "手续费"]),
        ("信用卡分期协议", "最低还款条款", ["最低还款", "循环利息", "复利"], {"repaymentMethod": "contractSummary.repaymentMethod"}, ["最低还款", "循环"]),
        ("医美分期合同", "服务失败条款", ["项目取消", "服务未完成", "退款"], {"refundRule": "clauses.refund"}, ["退费", "服务"]),
        ("医美分期合同", "贷款协同条款", ["合作金融机构", "分期平台", "贷款继续"], {"institution": "contractSummary.institution"}, ["医美", "分期"]),
        ("教育培训贷款合同", "退课退费条款", ["退课", "退费", "课程服务"], {"refundRule": "clauses.refund"}, ["培训", "退费"]),
        ("教育培训贷款合同", "机构跑路条款", ["课程中止", "服务终止", "贷款仍需偿还"], {"repayment": "contractSummary.repaymentMethod"}, ["培训贷", "服务失败"]),
        ("租房贷款合同", "租赁服务条款", ["租赁合同", "租金分期", "退租"], {"productType": "contractSummary.productType"}, ["租房贷", "退租"]),
        ("车贷合同", "车辆抵押条款", ["车辆抵押", "抵押登记", "处置车辆"], {"collateral": "clauses.collateral"}, ["抵押", "车辆"]),
        ("车贷合同", "GPS服务条款", ["GPS", "定位", "服务费"], {"privacy": "clauses.privacy"}, ["定位", "服务费"]),
        ("保险保单", "退保条款", ["现金价值", "退保", "扣费"], {"surrender": "clauses.surrender"}, ["退保", "现金价值"]),
        ("保险保单", "免责条款", ["责任免除", "不予理赔", "等待期"], {"exemption": "clauses.exemption"}, ["免责", "理赔"]),
        ("担保合同", "连带责任条款", ["连带责任保证", "全部债务", "保证期间"], {"guarantee": "clauses.guarantee"}, ["担保", "连带"]),
        ("担保合同", "保证范围条款", ["本金", "利息", "罚息", "律师费"], {"guaranteeScope": "clauses.guarantee"}, ["保证范围", "实现债权费用"]),
        ("互联网平台贷", "自动扣款条款", ["自动扣款", "代扣授权", "扣款账户"], {"autoDebit": "clauses.authorization"}, ["扣款", "授权"]),
        ("互联网平台贷", "个人信息条款", ["征信授权", "信息共享", "关联公司"], {"privacy": "clauses.privacy"}, ["征信", "共享"]),
        ("融资租赁合同", "提前解约条款", ["提前解约", "剩余租金", "违约金"], {"termination": "clauses.termination"}, ["解约", "租金"]),
        ("融资租赁合同", "残值处置条款", ["车辆处置", "残值", "拍卖"], {"collateral": "clauses.collateral"}, ["处置", "残值"]),
        ("现金贷协议", "短期借款费用条款", ["服务费", "借款期限7天", "到期一次性还款"], {"fees": "costAnalysis.additionalFees"}, ["现金贷", "砍头息"]),
        ("消费分期协议", "商户合作条款", ["合作商户", "商品服务", "贷款发放"], {"merchant": "contractSummary.institution"}, ["商户", "分期"]),
        ("消费分期协议", "退款还款衔接条款", ["退款", "还款计划", "贷款合同"], {"refund": "clauses.refund"}, ["退款", "还款"]),
        ("小额贷款合同", "催收条款", ["催收", "紧急联系人", "外访"], {"collection": "clauses.collection"}, ["催收", "联系人"]),
    ]
    return [
        {
            "template_id": f"TPL{i:03d}",
            "contract_type": contract_type,
            "clause_category": category,
            "common_patterns": json.dumps(patterns, ensure_ascii=False),
            "field_mapping": json.dumps(mapping, ensure_ascii=False),
            "risk_indicators": json.dumps(indicators, ensure_ascii=False),
            "version": 1,
            "effective_date": TODAY,
            "expiry_date": "",
            "is_active": 1,
            "source": "seed",
            "source_url": "",
            "imported_at": TODAY,
            "review_status": "approved",
        }
        for i, (contract_type, category, patterns, mapping, indicators) in enumerate(names, start=1)
    ]


def build_products() -> list[dict[str, Any]]:
    products = [
        ("建行快贷", "中国建设银行", "bank_consumer_loan", "3.5%-12%", ["利息", "可能有提前结清规则"], "支持提前还款，具体以页面为准", "逾期可能产生罚息并影响征信"),
        ("招行闪电贷", "招商银行", "bank_consumer_loan", "3.2%-15%", ["利息"], "通常支持提前还款", "逾期罚息和征信报送"),
        ("工行融e借", "中国工商银行", "bank_consumer_loan", "3.7%-14%", ["利息"], "按合同约定提前还款", "逾期影响征信"),
        ("中银E贷", "中国银行", "bank_consumer_loan", "3.5%-15%", ["利息"], "支持提前还款", "逾期罚息"),
        ("农行网捷贷", "中国农业银行", "bank_consumer_loan", "3.5%-14%", ["利息"], "支持提前还款", "逾期罚息和征信"),
        ("邮享贷", "邮储银行", "bank_consumer_loan", "4%-16%", ["利息"], "以合同为准", "逾期罚息"),
        ("中银消费金融新易贷", "中银消费金融", "consumer_finance", "7%-24%", ["利息", "可能有服务费"], "以合同和产品页面为准", "逾期罚息并可能催收"),
        ("马上消费金融安逸花", "马上消费金融", "consumer_finance", "7.2%-24%", ["利息", "服务费"], "以页面为准", "逾期罚息及征信影响"),
        ("招联好期贷", "招联消费金融", "consumer_finance", "7.3%-24%", ["利息"], "可申请提前还款", "逾期影响征信"),
        ("兴业消费金融家庭消费贷", "兴业消费金融", "consumer_finance", "8%-24%", ["利息"], "以合同为准", "逾期罚息"),
        ("捷信消费贷", "捷信消费金融", "consumer_finance", "10%-24%", ["利息", "服务费"], "提前还款政策需核实", "逾期催收和罚息"),
        ("蚂蚁借呗", "蚂蚁集团合作金融机构", "internet_platform_loan", "5%-24%", ["利息"], "支持提前还款", "逾期影响芝麻信用/征信"),
        ("花呗分期", "蚂蚁集团", "platform_installment", "折算年化随期数变化", ["分期手续费"], "提前结清政策以页面为准", "逾期费用和信用影响"),
        ("京东白条", "京东科技", "platform_installment", "折算年化随期数变化", ["分期服务费"], "支持提前结清，费用规则需核实", "逾期违约金和信用影响"),
        ("美团月付", "美团", "platform_installment", "折算年化随期数变化", ["分期手续费"], "以页面为准", "逾期费用"),
        ("度小满有钱花", "度小满合作金融机构", "internet_platform_loan", "7.2%-24%", ["利息"], "支持提前还款", "逾期罚息和征信"),
        ("360借条", "奇富科技合作金融机构", "internet_platform_loan", "7.2%-24%", ["利息"], "以合同为准", "逾期罚息和催收"),
        ("微粒贷", "微众银行", "internet_bank_loan", "7%-18%", ["利息"], "支持提前还款", "逾期影响征信"),
        ("平安银行信用卡分期", "平安银行", "credit_card_installment", "折算年化约7%-18%", ["分期手续费"], "提前结清手续费政策需核实", "逾期利息和违约金"),
        ("招商银行信用卡分期", "招商银行", "credit_card_installment", "折算年化约7%-18%", ["分期手续费"], "提前结清规则以账单为准", "逾期利息"),
        ("工商银行信用卡分期", "中国工商银行", "credit_card_installment", "折算年化约6%-16%", ["分期手续费"], "以信用卡协议为准", "逾期利息"),
        ("建设银行信用卡分期", "中国建设银行", "credit_card_installment", "折算年化约6%-17%", ["分期手续费"], "以信用卡协议为准", "逾期利息"),
        ("汽车消费贷款", "商业银行/汽车金融公司", "auto_loan", "4%-15%", ["利息", "GPS费", "评估费"], "提前还款可能有违约金", "逾期可能处置抵押车辆"),
        ("医美消费分期", "消费金融公司/平台", "merchant_installment", "8%-24%", ["服务费", "咨询费", "分期手续费"], "退费和提前还款需核实", "服务失败仍可能被扣款"),
    ]
    return [
        {
            "product_id": f"PROD{i:03d}",
            "product_name": name,
            "product_type": ptype,
            "institution": institution,
            "typical_rate_range": rate_range,
            "common_fees": json.dumps(fees, ensure_ascii=False),
            "prepayment_policy": prepay,
            "overdue_policy": overdue,
            "version": 1,
            "effective_date": TODAY,
            "expiry_date": "",
            "is_active": 1,
            "source": "seed",
            "source_url": "",
            "imported_at": TODAY,
            "review_status": "approved",
        }
        for i, (name, institution, ptype, rate_range, fees, prepay, overdue) in enumerate(products, start=1)
    ]


def build_market_rates() -> list[dict[str, Any]]:
    rows = []
    months = []
    for year in [2024, 2025, 2026]:
        end_month = 6 if year == 2026 else 12
        start_month = 7 if year == 2024 else 1
        for month in range(start_month, end_month + 1):
            months.append(date(year, month, 20).isoformat())
    for effective in months:
        y, m, _ = effective.split("-")
        year_month = int(y) * 100 + int(m)
        if year_month < 202407:
            one, five = 3.45, 3.95
        elif year_month < 202410:
            one, five = 3.35, 3.85
        elif year_month < 202505:
            one, five = 3.10, 3.60
        else:
            one, five = 3.00, 3.50
        for rate_type, value in [("LPR_1Y", one), ("LPR_5Y", five)]:
            rows.append(
                {
                    "rate_id": f"{rate_type}_{effective[:7].replace('-', '')}",
                    "rate_type": rate_type,
                    "rate_value": value,
                    "effective_date": effective,
                    "source": "seed_manual_lpr_reference",
                    "version": 1,
                    "expiry_date": "",
                    "is_active": 1,
                    "source_url": "https://www.pbc.gov.cn/",
                    "imported_at": TODAY,
                    "review_status": "approved",
                }
            )
    return rows


def build_glossary() -> list[dict[str, Any]]:
    terms = [
        ("等额本息", "每期还款金额基本相同，但前期利息占比高、本金占比低。", "repayment", "12期每月还940元。"),
        ("等额本金", "每期偿还相同本金，利息随剩余本金下降，前期还款压力较大。", "repayment", "每月本金固定，利息逐月减少。"),
        ("等本等息", "本金和利息按期平均分摊，折算真实年化通常高于直观看到的费率。", "interest", "每月本金加固定手续费。"),
        ("IRR", "内部收益率，用每期现金流折算真实年化成本。", "interest", "到账9500元、每月还940元可用IRR估算。"),
        ("APR", "年化利率口径，需确认是否包含服务费、手续费等全部成本。", "interest", "宣传年化不一定等于真实年化。"),
        ("砍头息", "放款前或放款时先扣利息/费用，实际到手金额低于合同本金。", "cost", "合同写借10000元，到手只有9500元。"),
        ("服务费", "除利息外收取的服务相关费用，需判断是否计入综合融资成本。", "cost", "平台服务费500元。"),
        ("管理费", "以账户、贷后或平台管理名义收取的费用。", "cost", "每月收账户管理费。"),
        ("担保费", "为担保服务收取的费用，需确认是否自愿和可退。", "guarantee", "贷款需支付担保费。"),
        ("保证金", "履约或风险保证用途的资金，需确认退还条件。", "guarantee", "放款前缴纳保证金。"),
        ("连带责任", "债务人不还款时，保证人可能被直接要求承担全部责任。", "guarantee", "保证人承担连带清偿责任。"),
        ("保证期间", "保证人承担保证责任的时间范围。", "guarantee", "主债务到期后三年。"),
        ("提前结清", "在约定期限前一次性还清剩余债务。", "prepayment", "第6期提前还清剩余本金。"),
        ("提前还款违约金", "提前还款时被要求支付的补偿或违约费用。", "prepayment", "按剩余本金2%收取。"),
        ("逾期罚息", "逾期后按照约定利率或倍数加收的利息。", "overdue", "逾期按正常利率1.5倍计收。"),
        ("违约金", "合同违约时按约定支付的赔偿金额。", "overdue", "逾期每天收取违约金。"),
        ("复利", "把未付利息继续作为本金计息。", "interest", "利息再产生利息。"),
        ("循环利息", "信用卡未全额还款时对未还部分或交易金额计收的利息。", "credit_card", "最低还款后产生循环利息。"),
        ("最低还款", "只偿还账单的一小部分以避免逾期，但会产生利息。", "credit_card", "账单10000元最低还1000元。"),
        ("自动扣款", "授权机构到期从指定账户直接划扣款项。", "authorization", "每月还款日自动扣款。"),
        ("自动续费", "服务期满后自动延续并扣费。", "authorization", "会员到期自动续费。"),
        ("征信授权", "授权机构查询或报送个人信用信息。", "privacy", "贷款审批查询征信。"),
        ("敏感个人信息", "泄露或滥用容易损害人格尊严或财产安全的信息。", "privacy", "身份证、人脸、银行账户。"),
        ("格式条款", "一方预先拟定、未与对方协商的合同条款。", "contract", "平台标准借款协议。"),
        ("免责条款", "限制或免除一方责任的条款。", "contract", "平台对服务中断不承担责任。"),
        ("协议管辖", "合同约定争议由某地法院或仲裁机构处理。", "contract", "由贷款人所在地法院管辖。"),
        ("捆绑销售", "把贷款与保险、会员、服务包等绑定销售。", "sales", "不买保险就不能贷款。"),
        ("冷静期", "签约后一定期间内可撤销或解除的期限。", "exit", "7天内可申请取消服务。"),
        ("退保现金价值", "长期保险退保时可退回的价值，通常低于已交保费。", "insurance", "交费一年退保只退现金价值。"),
        ("融资租赁", "以租赁形式取得车辆等资产使用权，期满后可能购买或归还。", "auto", "汽车融资租赁。"),
        ("LPR", "贷款市场报价利率，可作为贷款利率定价参考基准。", "interest", "1年期LPR为市场基准之一。"),
        ("真实年化", "把利息和费用按现金流折算后的年化成本。", "interest", "服务费计入后真实年化上升。"),
    ]
    return [
        {
            "term_id": f"TERM{i:03d}",
            "term": term,
            "definition": definition,
            "category": category,
            "example": example,
            "version": 1,
            "effective_date": TODAY,
            "expiry_date": "",
            "is_active": 1,
            "source": "seed",
            "source_url": "",
            "imported_at": TODAY,
            "review_status": "approved",
        }
        for i, (term, definition, category, example) in enumerate(terms, start=1)
    ]


def main() -> None:
    risk_rules = build_risk_rules()
    regulations = build_regulations()
    cases = build_cases()
    templates = build_templates()
    products = build_products()
    market_rates = build_market_rates()
    glossary = build_glossary()

    common = ["version", "effective_date", "expiry_date", "is_active", "source", "source_url", "imported_at", "review_status"]
    write_dataset("risk_rules", "risk_rules", "rule_id", risk_rules, ["rule_id", "rule_name", "category", "condition", "risk_level", "weight", "legal_basis", "question_to_ask", "created_at", "updated_at", *common])
    write_dataset("legal_regulations", "legal_regulations", "regulation_id", regulations, ["regulation_id", "title", "issuing_body", "issue_date", "effective_date", "status", "summary", "full_text", "keywords", "source_url", "applicable_scenarios", "version", "expiry_date", "is_active", "source", "imported_at", "review_status"])
    write_dataset("cases", "cases", "case_id", cases, ["case_id", "title", "scenario", "risk_type", "description", "dispute_point", "user_loss", "handling_result", "rights_path", "source_url", "embedding", *common])
    write_dataset("contract_templates", "contract_clause_templates", "template_id", templates, ["template_id", "contract_type", "clause_category", "common_patterns", "field_mapping", "risk_indicators", *common])
    write_dataset("financial_products", "financial_products", "product_id", products, ["product_id", "product_name", "product_type", "institution", "typical_rate_range", "common_fees", "prepayment_policy", "overdue_policy", *common])
    write_dataset("market_rates", "market_rates", "rate_id", market_rates, ["rate_id", "rate_type", "rate_value", "effective_date", "source", "version", "expiry_date", "is_active", "source_url", "imported_at", "review_status"])
    write_dataset("financial_glossary", "financial_glossary", "term_id", glossary, ["term_id", "term", "definition", "category", "example", *common])

    manifest = {
        "generatedAt": TODAY,
        "counts": {
            "risk_rules": len(risk_rules),
            "legal_regulations": len(regulations),
            "cases": len(cases),
            "contract_templates": len(templates),
            "financial_products": len(products),
            "market_rates": len(market_rates),
            "financial_glossary": len(glossary),
        },
        "note": "Seed data is for local MVP demos and knowledge-base bootstrapping. Production use should verify sources and update records through the dynamic ingestion workflow.",
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
