import { ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretUp } from "@phosphor-icons/react/CaretUp";
import { FileText } from "@phosphor-icons/react/FileText";
import { useState } from "react";
import type { CaseReferenceView } from "../utils/reportViewModel";
import { shortenText } from "../utils/reportViewModel";

type CaseReferenceCardProps = {
  item: CaseReferenceView;
};

const formatSimilarity = (value: number | null) => {
  if (value === null) return null;
  return value <= 1 ? `${Math.round(value * 100)}% 匹配` : `${value.toFixed(1)} 分匹配`;
};

export function CaseReferenceCard({ item }: CaseReferenceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = `case-reference-${item.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const similarity = formatSimilarity(item.similarity);
  const hasSourceMeta = Boolean(item.sourceName || item.publishedAt || item.documentNumber);

  return (
    <article className="case-reference-card">
      <button
        className="case-reference-card__summary"
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="case-reference-card__title">
          <FileText size={20} weight="duotone" aria-hidden="true" />
          <span>
            <strong>{item.title}</strong>
            <small>{shortenText(item.relation ?? item.summary ?? item.sourceName ?? "匹配案例", 72)}</small>
          </span>
        </span>
        <span className="case-reference-card__meta">
          {similarity && <span>{similarity}</span>}
          {expanded ? <CaretUp size={18} /> : <CaretDown size={18} />}
        </span>
      </button>

      {expanded && (
        <div className="case-reference-card__details" id={contentId}>
          {item.relation && (
            <div className="case-reference-card__block">
              <span>关联说明</span>
              <p>{item.relation}</p>
            </div>
          )}

          {hasSourceMeta && (
            <dl className="case-source-grid">
              {item.sourceName && (
                <div>
                  <dt>来源机构</dt>
                  <dd>{item.sourceName}</dd>
                </div>
              )}
              {item.publishedAt && (
                <div>
                  <dt>发布时间</dt>
                  <dd>{item.publishedAt}</dd>
                </div>
              )}
              {item.documentNumber && (
                <div>
                  <dt>可核验标识</dt>
                  <dd>{item.documentNumber}</dd>
                </div>
              )}
            </dl>
          )}

          {item.summary && (
            <div className="case-reference-card__block">
              <span>案例摘要</span>
              <p>{item.summary}</p>
            </div>
          )}

          <div className="case-source-actions">
            {item.sourceUrl ? (
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                查看来源
                <ArrowSquareOut size={16} weight="bold" aria-hidden="true" />
              </a>
            ) : (
              !item.hasVerifiableSource && <span>当前数据未提供可核验来源</span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
