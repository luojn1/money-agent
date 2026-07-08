const internalTermPattern =
  /(Express\s*Pipeline|Pipeline|runtimeMode|run_contract_cost|run_risk_case|run_recommendation_action|真实多\s*Agent|多\s*Agent|Agent\s*分析|Agent|source_agent|integrated\s*mode|INTEGRATED|LOCAL_PREVIEW|backend|后端|debug|trace|Mock|B\/C\/D|B\s*合同|C\s*风险|D\s*建议|展示链路|未调用真实|部分完成)/i;

const internalFieldPattern =
  /(risk_id|rr\s*编号|clause_id|evidence_start|evidence_end|debug_trace_id|chunk_id|raw_retrieval_id|task\s*内部运行\s*id|agent\s*run\s*id|function\s*name|backend\s*job\s*name|source_agent)\s*[=:：]?\s*[\w./-]*/gi;

const sentencePattern = /[^。！？；!?;]+[。！？；!?;]?/g;

export const hasInternalUserFacingText = (text: string | null | undefined) =>
  Boolean(text && internalTermPattern.test(text));

export const cleanUserFacingText = (text: string | null | undefined, fallback = "") => {
  if (!text) return fallback;

  const withoutInternalFields = text
    .replace(internalFieldPattern, "")
    .replace(/(?:Mock\s*数据|演示数据|演示案例|演示规则|演示产品|演示模式)[：:]/gi, "")
    .replace(/\b(?:REG|RR|PROD)-[\w/-]+[：:]/gi, "")
    .replace(/知识库规则[：:]/g, "")
    .replace(/本地知识库/g, "参考数据")
    .replace(/参考产品知识条目[：:].*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = withoutInternalFields.match(sentencePattern) ?? [withoutInternalFields];
  const cleaned = sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !internalTermPattern.test(sentence))
    .join("")
    .replace(/\s+([，。；：！？])/g, "$1")
    .trim();

  return cleaned || fallback;
};
