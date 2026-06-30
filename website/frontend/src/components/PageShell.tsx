import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";

type PageShellProps = {
  children: ReactNode;
  compactHeader?: boolean;
};

export function PageShell({ children, compactHeader = false }: PageShellProps) {
  return (
    <div className="app-shell">
      <SiteHeader compact={compactHeader} />
      {children}
    </div>
  );
}
