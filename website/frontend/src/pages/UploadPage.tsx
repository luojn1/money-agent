import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Calculator } from "@phosphor-icons/react/Calculator";
import { ClipboardText } from "@phosphor-icons/react/ClipboardText";
import { FileText } from "@phosphor-icons/react/FileText";
import { LockKey } from "@phosphor-icons/react/LockKey";
import { Receipt } from "@phosphor-icons/react/Receipt";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { type DragEvent, type FormEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { api } from "../services/api";

const acceptedFileTypes = ".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp";

export function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [contractText, setContractText] = useState("");
  const [exampleSelected, setExampleSelected] = useState(false);
  const [incomeRange, setIncomeRange] = useState("");
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const chooseFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setExampleSelected(false);
    setError("");
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    chooseFile(event.dataTransfer.files);
  };

  const selectExample = () => {
    setExampleSelected(true);
    setSelectedFile(null);
    setError("");
  };

  const startAnalysis = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile && !contractText.trim() && !exampleSelected) {
      setError("请先上传合同、粘贴合同文字，或选择示例合同。值得看的报告，需要先有一份合同。");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const contractName = selectedFile?.name ?? (exampleSelected ? "示例消费贷合同.pdf" : "粘贴的合同文字");
      const task = exampleSelected && !selectedFile && !contractText.trim()
        ? await api.createDemoAnalysis({ contractName })
        : await api.createUploadAnalysis({
            contractFile: selectedFile ?? undefined,
            contractText: contractText.trim() || undefined,
          });
      sessionStorage.setItem(`analysis:${task.taskId}:contractName`, contractName);
      navigate(`/analysis/${task.taskId}`, { state: { contractName } });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "暂时无法开始分析，请稍后重试。");
      setSubmitting(false);
    }
  };

  return (
    <PageShell>
      <main className="upload-page">
        <section className="upload-hero" aria-labelledby="upload-title">
          <p className="eyebrow">消费贷合同体检</p>
          <h1 id="upload-title">上传消费贷合同，帮你看懂条款、算清成本、识别风险</h1>
          <p className="upload-hero__subtitle">不绕术语，先把真正影响钱包的数字和条款讲清楚。</p>
          <div className="trust-row" aria-label="服务说明">
            <span><ShieldCheck size={20} weight="duotone" />保护隐私，仅用于分析</span>
            <span><LockKey size={20} weight="duotone" />本轮不保存合同内容</span>
            <span><CheckCircle size={20} weight="duotone" />结果中立，不偏不倚</span>
          </div>
        </section>

        <form className="analysis-form upload-workspace" onSubmit={startAnalysis} noValidate>
          <div className="upload-main-column">
            <section className="form-section" aria-labelledby="contract-input-title">
              <div className="section-heading-row">
                <div>
                  <p className="section-kicker">第 1 步</p>
                  <h2 id="contract-input-title">选择合同内容</h2>
                </div>
                <button
                  type="button"
                  className={`text-button${exampleSelected ? " text-button--selected" : ""}`}
                  onClick={selectExample}
                >
                  {exampleSelected ? <CheckCircle size={19} weight="fill" /> : <FileText size={19} />}
                  {exampleSelected ? "已选择示例合同" : "使用示例合同"}
                </button>
              </div>

              <input
                className="visually-hidden"
                ref={inputRef}
                type="file"
                accept={acceptedFileTypes}
                onChange={(event) => chooseFile(event.target.files)}
                aria-label="选择合同文件"
              />
              <button
                className={`drop-zone${selectedFile ? " drop-zone--selected" : ""}`}
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                {selectedFile ? <CheckCircle size={38} weight="duotone" /> : <UploadSimple size={38} weight="duotone" />}
                <strong>{selectedFile ? selectedFile.name : "点击或拖拽合同到这里"}</strong>
                <span>{selectedFile ? "将读取文本层；图片会尝试 OCR 识别" : "支持 PDF、DOCX、TXT、JPG、PNG、WEBP"}</span>
              </button>

              <div className="or-divider"><span>或</span></div>

              <label className="field-label" htmlFor="contract-text">粘贴合同文字</label>
              <textarea
                id="contract-text"
                value={contractText}
                onChange={(event) => {
                  setContractText(event.target.value);
                  if (event.target.value.trim()) setError("");
                }}
                placeholder="在此粘贴合同全部或部分文字内容（选填）"
                rows={5}
                maxLength={100_000}
              />
              <span className="character-count">{contractText.length.toLocaleString("zh-CN")} / 100,000</span>
            </section>

            <section className="form-section form-section--compact" aria-labelledby="context-title">
              <div>
                <p className="section-kicker">第 2 步 · 选填</p>
                <h2 id="context-title">补充你的还款情况</h2>
                <p className="section-description">用于帮助你判断月供压力，不影响本次合同成本计算。</p>
              </div>
              <div className="field-grid">
                <label>
                  <span>月收入区间</span>
                  <select value={incomeRange} onChange={(event) => setIncomeRange(event.target.value)}>
                    <option value="">请选择月收入区间</option>
                    <option value="under-5k">5,000 元以下</option>
                    <option value="5k-10k">5,000-10,000 元</option>
                    <option value="10k-20k">10,000-20,000 元</option>
                    <option value="over-20k">20,000 元以上</option>
                  </select>
                </label>
                <label>
                  <span>当前已有月供</span>
                  <span className="input-with-suffix">
                    <input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={monthlyPayment}
                      onChange={(event) => setMonthlyPayment(event.target.value)}
                      placeholder="请输入金额"
                    />
                    <span>元</span>
                  </span>
                </label>
              </div>
            </section>

            {error && <div className="form-error" role="alert">{error}</div>}

            <button className="primary-button primary-button--wide" type="submit" disabled={submitting}>
              {submitting ? "正在创建分析任务…" : "开始分析"}
            </button>
            <p className="privacy-note"><ShieldCheck size={18} weight="duotone" />文件仅保存在本地演示服务内存中，用于本次识别和测算。</p>
          </div>

          <aside className="upload-side-panel" aria-label="分析路径">
            <div className="side-panel__heading">
              <span>分析路径</span>
              <strong>从合同文字到真实成本</strong>
            </div>
            <ol className="capability-list">
              <li><FileText size={20} weight="duotone" /><span>上传识别</span><small>PDF 文本层、Word、图片 OCR</small></li>
              <li><ClipboardText size={20} weight="duotone" /><span>合同解析</span><small>金额、期限、利率、费用、条款定位</small></li>
              <li><Calculator size={20} weight="duotone" /><span>成本测算</span><small>调用知识库规则生成现金流和真实年化</small></li>
              <li><Receipt size={20} weight="duotone" /><span>报告输出</span><small>保留原文依据和签约前追问清单</small></li>
            </ol>
          </aside>
        </form>
      </main>
    </PageShell>
  );
}
