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
};

const unknownFullText = "已识别参考依据，但暂未收录完整条文。请以官方法律文本为准。";

const localLegalReferences: Record<string, ResolvedLegalReference> = {
  "民法典:496": {
    lawName: "中华人民共和国民法典",
    articleNumber: "第496条",
    articleTitle: "格式条款",
    fullText:
      "格式条款是当事人为了重复使用而预先拟定，并在订立合同时未与对方协商的条款。采用格式条款订立合同的，提供格式条款的一方应当遵循公平原则确定当事人之间的权利和义务，并采取合理的方式提示对方注意免除或者减轻其责任等与对方有重大利害关系的条款，按照对方的要求，对该条款予以说明。提供格式条款的一方未履行提示或者说明义务，致使对方没有注意或者理解与其有重大利害关系的条款的，对方可以主张该条款不成为合同的内容。",
    relevance: "用于判断格式条款、费用说明、免责或加重责任条款是否经过充分提示和说明。",
    sourceNote: "本地常用法条映射；具体以官方法律文本为准。",
  },
  "民法典:497": {
    lawName: "中华人民共和国民法典",
    articleNumber: "第497条",
    articleTitle: "格式条款无效情形",
    fullText:
      "有下列情形之一的，该格式条款无效：（一）具有本法第一编第六章第三节和本法第五百零六条规定的无效情形；（二）提供格式条款一方不合理地免除或者减轻其责任、加重对方责任、限制对方主要权利；（三）提供格式条款一方排除对方主要权利。",
    relevance: "用于判断免责、单方变更、限制主要权利等格式条款风险。",
    sourceNote: "本地常用法条映射；具体以官方法律文本为准。",
  },
  "民法典:585": {
    lawName: "中华人民共和国民法典",
    articleNumber: "第585条",
    articleTitle: "违约金",
    fullText:
      "当事人可以约定一方违约时应当根据违约情况向对方支付一定数额的违约金，也可以约定因违约产生的损失赔偿额的计算方法。约定的违约金低于造成的损失的，人民法院或者仲裁机构可以根据当事人的请求予以增加；约定的违约金过分高于造成的损失的，人民法院或者仲裁机构可以根据当事人的请求予以适当减少。当事人就迟延履行约定违约金的，违约方支付违约金后，还应当履行债务。",
    relevance: "用于判断逾期违约金、解约金、提前结清违约金是否可能过高。",
    sourceNote: "本地常用法条映射；具体以官方法律文本为准。",
  },
  "民法典:670": {
    lawName: "中华人民共和国民法典",
    articleNumber: "第670条",
    articleTitle: "借款利息不得预先扣除",
    fullText:
      "借款的利息不得预先在本金中扣除。利息预先在本金中扣除的，应当按照实际借款数额返还借款并计算利息。",
    relevance: "用于判断实际到账金额低于合同本金、预扣服务费或疑似砍头息问题。",
    sourceNote: "本地常用法条映射；具体以官方法律文本为准。",
  },
  "民法典:677": {
    lawName: "中华人民共和国民法典",
    articleNumber: "第677条",
    articleTitle: "提前返还借款的利息计算",
    fullText:
      "借款人提前返还借款的，除当事人另有约定外，应当按照实际借款的期间计算利息。",
    relevance: "用于判断提前还款、提前结清、剩余利息和相关手续费的核对重点。",
    sourceNote: "本地常用法条映射；具体以官方法律文本为准。",
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
  return [...deduped.values()].map((reference) => ({
    ...reference,
    fullText: reference.fullText || unknownFullText,
  }));
};
