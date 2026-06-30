import type { Icon } from "@phosphor-icons/react";

type MetricCardProps = {
  label: string;
  value: string;
  icon: Icon;
  emphasis?: boolean;
};

export function MetricCard({ label, value, icon: IconComponent, emphasis = false }: MetricCardProps) {
  return (
    <article className={`metric-card${emphasis ? " metric-card--emphasis" : ""}`}>
      <div className="metric-card__icon" aria-hidden="true">
        <IconComponent size={22} weight="duotone" />
      </div>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}
