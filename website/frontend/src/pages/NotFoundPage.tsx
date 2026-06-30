import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { FileX } from "@phosphor-icons/react/FileX";
import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";

export function NotFoundPage() {
  return (
    <PageShell compactHeader>
      <main className="state-page">
        <FileX size={48} weight="duotone" />
        <p className="eyebrow">404</p>
        <h1>这页合同条款走丢了</h1>
        <p>你访问的页面不存在，回到上传页重新开始吧。</p>
        <Link className="primary-button" to="/"><ArrowLeft size={18} />返回上传页</Link>
      </main>
    </PageShell>
  );
}
