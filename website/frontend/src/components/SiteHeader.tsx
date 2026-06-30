import { CurrencyCny } from "@phosphor-icons/react/CurrencyCny";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { Link } from "react-router-dom";

type SiteHeaderProps = {
  compact?: boolean;
};

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  return (
    <header className={`site-header${compact ? " site-header--compact" : ""}`}>
      <div className="site-header__inner">
        <Link className="brand" to="/" aria-label="返回看得懂的钱首页">
          <span className="brand__mark" aria-hidden="true">
            <CurrencyCny weight="bold" size={22} />
          </span>
          <span>看得懂的钱</span>
        </Link>
        <div className="header-trust">
          <ShieldCheck size={18} weight="duotone" aria-hidden="true" />
          <span>合同内容仅用于本次演示分析</span>
        </div>
      </div>
    </header>
  );
}
