export type LegalReferenceInput = {
  lawName?: string;
  articleNumber?: string;
  articleTitle?: string;
  fullText?: string;
  relevance?: string;
  sourceNote?: string;
  title?: string;
  summary?: string;
  sourceUrl?: string | null;
};

export type ResolvedLegalReference = {
  lawName: string;
  articleNumber: string | null;
  articleTitle: string | null;
  fullText: string | null;
  relevance: string;
  sourceNote: string;
  sourceUrl: string | null;
  referenceType: "identified" | "general";
};

type StoredLegalReference = Omit<ResolvedLegalReference, "referenceType">;

const unknownFullText = "已识别参考依据，但暂未收录完整条文。请以官方法律文本为准。";
const civilCodeSourceUrl = "https://www.moj.gov.cn/pub/sfbgw/zwgkztzl/2025nianzhuanti/2025mfdxcy/2025mfdxcy_mfdql/202505/t20250507_518708.html";
const consumerProtectionLawSourceUrl = "https://www.gjxfj.gov.cn/gjxfj/fgwj/flfg/webinfo/2014/05/1601761496745758.htm";
const consumerProtectionRegulationSourceUrl = "https://www.gov.cn/zhengce/content/202403/content_6940158.htm";
const personalInformationProtectionSourceUrl = "https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm";
const creditBusinessSourceUrl = "https://www.moj.gov.cn/pub/sfbgw/flfggz/flfggzbmgz/202112/t20211202_442983.html";
const financeConsumerProtectionSourceUrl = "https://www.pbc.gov.cn/tiaofasi/144941/144957/4099060/index.html";
const personalLoanSourceUrl = "https://www.moj.gov.cn/pub/sfbgw/flfggz/flfggzbmgz/202410/t20241031_508785.html";
const loanCostDisclosureSourceUrl = "https://www.nfra.gov.cn/cn/view/pages/governmentDetail.html?docId=1251479&generaltype=1&itemId=861";
const bankInsuranceConsumerSourceUrl = "https://www.nfra.gov.cn/cn/view/pages/ItemDetail.html?docId=1087524&generaltype=0&itemId=4098";

const localLegalReferences: Record<string, StoredLegalReference> = {
  "民法典:496": {
    lawName: "中华人民共和国民法典",
    articleNumber: "第496条",
    articleTitle: "格式条款",
    fullText:
      "格式条款是当事人为了重复使用而预先拟定，并在订立合同时未与对方协商的条款。采用格式条款订立合同的，提供格式条款的一方应当遵循公平原则确定当事人之间的权利和义务，并采取合理的方式提示对方注意免除或者减轻其责任等与对方有重大利害关系的条款，按照对方的要求，对该条款予以说明。提供格式条款的一方未履行提示或者说明义务，致使对方没有注意或者理解与其有重大利害关系的条款的，对方可以主张该条款不成为合同的内容。",
    relevance: "用于判断格式条款、费用说明、免责或加重责任条款是否经过充分提示和说明。",
    sourceNote: "官方法律文本：司法部民法典全文。",
    sourceUrl: civilCodeSourceUrl,
  },
  "民法典:497": {
    lawName: "中华人民共和国民法典",
    articleNumber: "第497条",
    articleTitle: "格式条款无效情形",
    fullText:
      "有下列情形之一的，该格式条款无效：（一）具有本法第一编第六章第三节和本法第五百零六条规定的无效情形；（二）提供格式条款一方不合理地免除或者减轻其责任、加重对方责任、限制对方主要权利；（三）提供格式条款一方排除对方主要权利。",
    relevance: "用于判断免责、单方变更、限制主要权利等格式条款风险。",
    sourceNote: "官方法律文本：司法部民法典全文。",
    sourceUrl: civilCodeSourceUrl,
  },
  "民法典:509": {
    lawName: "中华人民共和国民法典",
    articleNumber: "第509条",
    articleTitle: "合同履行与诚信原则",
    fullText: "当事人应当按照约定全面履行自己的义务，并遵循诚信原则。",
    relevance: "用于判断还款安排、合同履行、费用说明和后续沟通是否符合诚信履约要求。",
    sourceNote: "官方法律文本：司法部民法典全文。",
    sourceUrl: civilCodeSourceUrl,
  },
  "民法典:585": {
    lawName: "中华人民共和国民法典",
    articleNumber: "第585条",
    articleTitle: "违约金",
    fullText:
      "当事人可以约定一方违约时应当根据违约情况向对方支付一定数额的违约金，也可以约定因违约产生的损失赔偿额的计算方法。约定的违约金低于造成的损失的，人民法院或者仲裁机构可以根据当事人的请求予以增加；约定的违约金过分高于造成的损失的，人民法院或者仲裁机构可以根据当事人的请求予以适当减少。当事人就迟延履行约定违约金的，违约方支付违约金后，还应当履行债务。",
    relevance: "用于判断逾期违约金、解约金、提前结清违约金是否可能过高。",
    sourceNote: "官方法律文本：司法部民法典全文。",
    sourceUrl: civilCodeSourceUrl,
  },
  "民法典:670": {
    lawName: "中华人民共和国民法典",
    articleNumber: "第670条",
    articleTitle: "借款利息不得预先扣除",
    fullText:
      "借款的利息不得预先在本金中扣除。利息预先在本金中扣除的，应当按照实际借款数额返还借款并计算利息。",
    relevance: "用于判断实际到账金额低于合同本金、预扣服务费或疑似砍头息问题。",
    sourceNote: "官方法律文本：司法部民法典全文。",
    sourceUrl: civilCodeSourceUrl,
  },
  "民法典:677": {
    lawName: "中华人民共和国民法典",
    articleNumber: "第677条",
    articleTitle: "提前返还借款的利息计算",
    fullText:
      "借款人提前返还借款的，除当事人另有约定外，应当按照实际借款的期间计算利息。",
    relevance: "用于判断提前还款、提前结清、剩余利息和相关手续费的核对重点。",
    sourceNote: "官方法律文本：司法部民法典全文。",
    sourceUrl: civilCodeSourceUrl,
  },
  "民法典:680": {
    lawName: "中华人民共和国民法典",
    articleNumber: "第680条",
    articleTitle: "禁止高利放贷",
    fullText: "禁止高利放贷，借款的利率不得违反国家有关规定。",
    relevance: "用于判断利率、综合融资成本、息费叠加后是否明显偏高。",
    sourceNote: "官方法律文本：司法部民法典全文。",
    sourceUrl: civilCodeSourceUrl,
  },
  "消保法:8": {
    lawName: "中华人民共和国消费者权益保护法",
    articleNumber: "第8条",
    articleTitle: "知情权",
    fullText: "消费者享有知悉其购买、使用的商品或者接受的服务的真实情况的权利。",
    relevance: "用于判断贷款金额、费用、年化成本、收取主体等是否充分披露。",
    sourceNote: "官方法律文本：国家信访局法律法规栏目。",
    sourceUrl: consumerProtectionLawSourceUrl,
  },
  "消保法:26": {
    lawName: "中华人民共和国消费者权益保护法",
    articleNumber: "第26条",
    articleTitle: "格式条款提示与不得排除消费者权利",
    fullText: "经营者使用格式条款，应当以显著方式提请消费者注意与其有重大利害关系的内容，不得以格式条款等方式排除或者限制消费者权利。",
    relevance: "用于判断合同中的免责、费用、授权、争议处理等格式条款是否对消费者充分提示。",
    sourceNote: "官方法律文本：国家信访局法律法规栏目。",
    sourceUrl: consumerProtectionLawSourceUrl,
  },
  "消保条例:9": {
    lawName: "中华人民共和国消费者权益保护法实施条例",
    articleNumber: "第9条",
    articleTitle: "真实、全面、通俗易懂的信息提供",
    fullText: "经营者应当采用通俗易懂的方式，真实、全面地向消费者提供商品或者服务相关信息。",
    relevance: "用于判断费用说明、年化成本、还款安排是否以用户能理解的方式展示。",
    sourceNote: "官方法规文本：中国政府网。",
    sourceUrl: consumerProtectionRegulationSourceUrl,
  },
  "个人信息保护法:13": {
    lawName: "中华人民共和国个人信息保护法",
    articleNumber: "第13条",
    articleTitle: "个人信息处理的合法性基础",
    fullText: "处理个人信息应当具有法定情形，例如取得个人同意、为订立或履行合同所必需等。",
    relevance: "用于判断贷款申请、自动扣款、联系人信息、营销授权等个人信息处理是否有明确依据。",
    sourceNote: "官方法律文本：中央网信办转载中国人大网全文。",
    sourceUrl: personalInformationProtectionSourceUrl,
  },
  "个人信息保护法:29": {
    lawName: "中华人民共和国个人信息保护法",
    articleNumber: "第29条",
    articleTitle: "敏感个人信息单独同意",
    fullText: "处理敏感个人信息应当取得个人的单独同意；法律、行政法规规定应取得书面同意的，从其规定。",
    relevance: "用于判断银行卡、征信、精准画像、自动扣款等敏感信息授权是否足够明确。",
    sourceNote: "官方法律文本：中央网信办转载中国人大网全文。",
    sourceUrl: personalInformationProtectionSourceUrl,
  },
  "征信业务管理办法:12": {
    lawName: "征信业务管理办法",
    articleNumber: "第12条",
    articleTitle: "采集个人信用信息的同意与告知",
    fullText: "征信机构采集个人信用信息应当经信息主体本人同意，并且明确告知采集信用信息的目的。",
    relevance: "用于判断征信查询、征信报送、授权用途和个人信用信息处理是否经过明确告知同意。",
    sourceNote: "官方部门规章文本：司法部。",
    sourceUrl: creditBusinessSourceUrl,
  },
  "金融消保实施办法": {
    lawName: "中国人民银行金融消费者权益保护实施办法",
    articleNumber: null,
    articleTitle: "金融产品和服务信息披露、营销宣传、消费者金融信息保护",
    fullText: "该办法要求银行、支付机构建立金融消费者权益保护制度，覆盖金融产品和服务信息披露、营销宣传、消费者金融信息保护、投诉处理等。",
    relevance: "用于判断金融产品说明、营销宣传、投诉处理和消费者金融信息保护是否有制度依据。",
    sourceNote: "官方部门规章文本：中国人民银行。",
    sourceUrl: financeConsumerProtectionSourceUrl,
  },
  "个人贷款管理办法": {
    lawName: "个人贷款管理办法",
    articleNumber: null,
    articleTitle: "个人贷款业务规范",
    fullText: "该办法规范银行业金融机构个人贷款业务，强调依法合规、审慎经营、平等自愿、公平诚信。",
    relevance: "用于判断个人消费贷款用途、合同履行、贷款流程和还款安排是否符合业务规范。",
    sourceNote: "官方部门规章文本：司法部。",
    sourceUrl: personalLoanSourceUrl,
  },
  "个人贷款业务明示综合融资成本规定": {
    lawName: "个人贷款业务明示综合融资成本规定",
    articleNumber: null,
    articleTitle: "综合融资成本明示",
    fullText: "该规定要求贷款人展示综合融资成本明示表，逐项列明息费项目、收取方式、标准、主体，并综合计算正常履约情形下的年化综合融资成本。",
    relevance: "用于判断真实年化、费用项目、逾期或有成本和收取主体是否清晰披露。",
    sourceNote: "官方监管规则：国家金融监督管理总局。",
    sourceUrl: loanCostDisclosureSourceUrl,
  },
  "银行保险机构消费者权益保护管理办法": {
    lawName: "银行保险机构消费者权益保护管理办法",
    articleNumber: null,
    articleTitle: "银行保险机构消费者权益保护",
    fullText: "该办法要求银行保险机构承担消费者权益保护主体责任，保护消费者知情权、自主选择权、公平交易权、信息安全权等合法权益。",
    relevance: "用于判断银行保险机构在合同展示、费用说明、授权处理、投诉沟通中的消费者权益保护要求。",
    sourceNote: "官方监管规则：国家金融监督管理总局。",
    sourceUrl: bankInsuranceConsumerSourceUrl,
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringValue = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

const chineseDigitMap: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const parseChineseArticleNumber = (value: string) => {
  let result = 0;
  let section = 0;
  let number = 0;
  for (const char of value) {
    const digit = chineseDigitMap[char];
    if (digit !== undefined) {
      number = digit;
      continue;
    }
    if (char === "十") {
      section += (number || 1) * 10;
      number = 0;
      continue;
    }
    if (char === "百") {
      section += (number || 1) * 100;
      number = 0;
      continue;
    }
    if (char === "千") {
      section += (number || 1) * 1000;
      number = 0;
    }
  }
  result = section + number;
  return result > 0 ? String(result) : null;
};

const articleDigits = (articleNumber: string | null) => {
  if (!articleNumber) return null;
  const digitMatch = articleNumber.match(/\d+/);
  if (digitMatch) return digitMatch[0];
  const chineseMatch = articleNumber.match(/[零〇一二三四五六七八九十百千]+/);
  return chineseMatch ? parseChineseArticleNumber(chineseMatch[0]) : null;
};

const legalKey = (lawName: string | null, articleNumber: string | null) => {
  const digits = articleDigits(articleNumber);
  if (!lawName || !digits) return null;
  if (/民法典/.test(lawName)) return `民法典:${digits}`;
  if (/消费者权益保护法/.test(lawName) && !/实施条例/.test(lawName)) return `消保法:${digits}`;
  if (/消费者权益保护法实施条例/.test(lawName)) return `消保条例:${digits}`;
  if (/个人信息保护法/.test(lawName)) return `个人信息保护法:${digits}`;
  if (/征信业务管理办法/.test(lawName)) return `征信业务管理办法:${digits}`;
  return `${lawName}:${digits}`;
};

const parseLegalTitle = (text: string) => {
  const match = text.match(/《([^》]+)》第([0-9零〇一二三四五六七八九十百千]+)条/);
  if (!match?.[1] || !match[2]) return null;
  return {
    lawName: match[1],
    articleNumber: `第${articleDigits(match[2]) ?? match[2]}条`,
  };
};

const resolveOne = (input: LegalReferenceInput): ResolvedLegalReference | null => {
  const title = stringValue(input.title);
  const parsedTitle = title ? parseLegalTitle(title) : null;
  const lawName = stringValue(input.lawName) ?? parsedTitle?.lawName ?? title;
  const articleNumber = stringValue(input.articleNumber) ?? parsedTitle?.articleNumber ?? null;
  if (!lawName) return null;

  const key = legalKey(lawName, articleNumber);
  const mapped = key ? localLegalReferences[key] : null;
  return {
    lawName: mapped?.lawName ?? lawName,
    articleNumber: mapped?.articleNumber ?? articleNumber,
    articleTitle: stringValue(input.articleTitle) ?? mapped?.articleTitle ?? null,
    fullText: stringValue(input.fullText) ?? mapped?.fullText ?? null,
    relevance: stringValue(input.relevance) ?? stringValue(input.summary) ?? mapped?.relevance ?? "该依据可作为理解本风险的参考。",
    sourceNote: stringValue(input.sourceNote) ?? stringValue(input.sourceUrl) ?? mapped?.sourceNote ?? "请以官方法律文本为准。",
    sourceUrl: stringValue(input.sourceUrl) ?? mapped?.sourceUrl ?? null,
    referenceType: "identified",
  };
};

const fromUnknownObject = (value: unknown): LegalReferenceInput | null => {
  if (!isRecord(value)) return null;
  return {
    lawName: stringValue(value.lawName) ?? undefined,
    articleNumber: stringValue(value.articleNumber) ?? undefined,
    articleTitle: stringValue(value.articleTitle) ?? undefined,
    fullText: stringValue(value.fullText) ?? undefined,
    relevance: stringValue(value.relevance) ?? undefined,
    sourceNote: stringValue(value.sourceNote) ?? undefined,
    title: stringValue(value.title) ?? undefined,
    summary: stringValue(value.summary) ?? undefined,
    sourceUrl: stringValue(value.sourceUrl),
  };
};

const fallbackReferenceKeysByCategory: Record<string, string[]> = {
  cost_transparency: ["个人贷款业务明示综合融资成本规定", "消保法:8", "民法典:496"],
  interest_fee: ["个人贷款业务明示综合融资成本规定", "民法典:670", "民法典:680"],
  repayment: ["个人贷款管理办法", "民法典:509", "金融消保实施办法"],
  prepayment: ["民法典:677", "个人贷款业务明示综合融资成本规定", "消保条例:9"],
  overdue: ["民法典:585", "个人贷款业务明示综合融资成本规定", "金融消保实施办法"],
  authorization_privacy: ["个人信息保护法:13", "个人信息保护法:29", "征信业务管理办法:12"],
  dispute_resolution: ["消保法:26", "银行保险机构消费者权益保护管理办法", "民法典:497"],
  other: ["银行保险机构消费者权益保护管理办法", "民法典:496"],
};

const fallbackReferenceKeysFromText = (text: string) => {
  const keys: string[] = [];
  if (/实际到账|预扣|扣除|砍头息|服务费|管理费|担保费|费用|年化|利率|综合成本/.test(text)) {
    keys.push("个人贷款业务明示综合融资成本规定", "民法典:670", "消保法:8");
  }
  if (/提前还款|提前结清|结清|手续费/.test(text)) {
    keys.push("民法典:677", "个人贷款业务明示综合融资成本规定");
  }
  if (/逾期|罚息|违约金|催收|通知费用/.test(text)) {
    keys.push("民法典:585", "金融消保实施办法");
  }
  if (/自动扣款|授权|银行卡|个人信息|隐私|征信|联系人|通讯录/.test(text)) {
    keys.push("个人信息保护法:13", "个人信息保护法:29", "征信业务管理办法:12");
  }
  if (/格式条款|免责|单方|变更|争议|仲裁|管辖/.test(text)) {
    keys.push("民法典:496", "民法典:497", "消保法:26");
  }
  return keys;
};

const fallbackLegalReferences = (item: Record<string, unknown>): ResolvedLegalReference[] => {
  const category = stringValue(item.category) ?? "other";
  const text = [
    stringValue(item.title),
    stringValue(item.categoryLabel),
    stringValue(item.reason),
    stringValue(item.possibleConsequence),
    stringValue(item.clauseText),
  ].filter(Boolean).join(" ");
  const categoryReferences = fallbackReferenceKeysByCategory[category] ?? fallbackReferenceKeysByCategory.other ?? [];
  const keys = [
    ...categoryReferences,
    ...fallbackReferenceKeysFromText(text),
  ];
  const uniqueKeys = [...new Set(keys)];
  return uniqueKeys
    .map((key) => localLegalReferences[key])
    .filter((reference): reference is StoredLegalReference => Boolean(reference))
    .map((reference) => ({ ...reference, referenceType: "general" as const }))
    .slice(0, 4);
};

const refsFromText = (text: string | null) => {
  if (!text) return [];
  const matches = [...text.matchAll(/《([^》]+)》第([0-9零〇一二三四五六七八九十百千]+)条/g)];
  return matches.flatMap((match) => {
    if (!match[1] || !match[2]) return [];
    return [{
      lawName: match[1],
      articleNumber: `第${articleDigits(match[2]) ?? match[2]}条`,
    }];
  });
};

export const resolveLegalReferences = (item: unknown): ResolvedLegalReference[] => {
  if (!isRecord(item)) return [];
  const candidates: LegalReferenceInput[] = [];

  const directReference = fromUnknownObject(item.legalReference);
  if (directReference) candidates.push(directReference);

  if (Array.isArray(item.legalReferences)) {
    item.legalReferences.forEach((reference) => {
      const parsed = fromUnknownObject(reference);
      if (parsed) candidates.push(parsed);
    });
  }

  [item.legalBasis, item.reference, item.lawArticle].forEach((value) => {
    const text = stringValue(value);
    if (text) candidates.push(...refsFromText(text));
  });

  if (isRecord(item.ruleEvidence)) {
    const basis = stringValue(item.ruleEvidence.legalBasis);
    if (basis) candidates.push(...refsFromText(basis));
  }

  const reason = stringValue(item.reason);
  if (reason) candidates.push(...refsFromText(reason));

  const deduped = new Map<string, ResolvedLegalReference>();
  candidates.forEach((candidate) => {
    const resolved = resolveOne(candidate);
    if (!resolved) return;
    const key = `${resolved.lawName}:${resolved.articleNumber ?? ""}:${resolved.fullText ?? ""}`;
    deduped.set(key, resolved);
  });
  if (deduped.size === 0) {
    fallbackLegalReferences(item).forEach((reference) => {
      const key = `${reference.lawName}:${reference.articleNumber ?? ""}:${reference.fullText ?? ""}`;
      deduped.set(key, reference);
    });
  }
  return [...deduped.values()].map((reference) => ({
    ...reference,
    fullText: reference.fullText || unknownFullText,
  })).slice(0, 5);
};
