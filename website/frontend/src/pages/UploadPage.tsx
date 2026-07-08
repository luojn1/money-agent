import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Calculator } from "@phosphor-icons/react/Calculator";
import { ClipboardText } from "@phosphor-icons/react/ClipboardText";
import { FileText } from "@phosphor-icons/react/FileText";
import { Receipt } from "@phosphor-icons/react/Receipt";
import { Robot } from "@phosphor-icons/react/Robot";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { type DragEvent, type FormEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { api } from "../services/api";

const acceptedFileTypes = ".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp";

export function UploadPage() {
  const navigate = useNavigate();
  const mockModeEnabled = api.isMockPipelineEnabled();
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
    if (!mockModeEnabled && exampleSelected && !selectedFile && !contractText.trim()) {
      setError("请上传合同文件或粘贴合同文字；示例合同仅用于体验示例分析。");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const contractName = selectedFile?.name ?? (exampleSelected ? "课程项目测试合同.txt" : "粘贴的合同文字");
      const task = exampleSelected && !selectedFile && !contractText.trim()
        ? await api.createDemoAnalysis({ contractName })
        : await api.createUploadAnalysis({
            contractFile: selectedFile ?? undefined,
            contractText: contractText.trim() || undefined,
          });
      sessionStorage.setItem(`analysis:${task.taskId}:contractName`, contractName);
      navigate(`/analysis/${task.taskId}`, { state: { contractName } });
    } catch {
      setError("暂时无法开始分析，请稍后重试。");
      setSubmitting(false);
    }
  };

  return (
    <PageShell>
      <main className="upload-page">
        <section className="upload-hero" aria-labelledby="upload-title">
          <p className="eyebrow">消费贷合同体检</p>
          <h1 id="upload-title">上传合同，帮你看清真实成本、关键风险和下一步行动</h1>
          <p className="upload-hero__subtitle">不绕术语，先把真正影响钱包的数字和条款讲清楚。</p>
          <p className="trust-row" aria-label="服务说明">建议先打码个人信息；报告用于签约前核对，不替代合同原文。</p>
        </section>

        <section className="analysis-flow" aria-labelledby="analysis-flow-title">
          <div className="analysis-flow__heading">
            <p className="section-kicker">分析流程</p>
            <h2 id="analysis-flow-title">从合同内容到行动清单，分四步看清楚</h2>
          </div>
          <ol className="flow-steps" aria-label="分析路径">
            <li>
              <span>1</span>
              <div>
                <strong>上传识别</strong>
                <small>PDF 文本层、Word、图片 OCR</small>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>成本分析</strong>
                <small>金额、期限、费用、现金流和真实年化</small>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>风险识别</strong>
                <small>风险条款、合同原文和典型情景</small>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>建议行动</strong>
                <small>确认问题、证据清单和行动计划</small>
              </div>
            </li>
          </ol>
        </section>

        <form className="analysis-form main-action-card" onSubmit={startAnalysis} noValidate aria-labelledby="contract-input-title">
          <div className="main-action-card__header">
            <div>
              <p className="section-kicker">主操作区</p>
              <h2 id="contract-input-title">开始分析你的合同</h2>
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
            {selectedFile ? <CheckCircle size={36} weight="duotone" /> : <UploadSimple size={36} weight="duotone" />}
            <strong>{selectedFile ? selectedFile.name : "点击或拖拽合同到这里"}</strong>
            <span>{selectedFile ? "将读取文本层；图片会尝试 OCR 识别" : "支持 PDF、DOCX、TXT、JPG、PNG、WEBP"}</span>
          </button>

          <div className="or-divider"><span>或粘贴合同文字</span></div>

          <div className="text-input-wrap">
            <textarea
              id="contract-text"
              aria-label="粘贴合同文字"
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
          </div>

          <section className="repayment-context" aria-labelledby="context-title">
            <div>
              <h3 id="context-title">补充你的还款情况</h3>
              <p>用于帮助你判断月供压力，不影响本次合同成本计算。</p>
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
            {submitting ? "正在开始分析…" : "开始分析"}
          </button>
          <p className="privacy-note"><ShieldCheck size={18} weight="duotone" />分析结果仅供参考，请结合合同原文核实。</p>
        </form>

        <section className="value-section" aria-labelledby="value-title">
          <div className="analysis-flow__heading">
            <p className="section-kicker">你会得到什么</p>
            <h2 id="value-title">把影响决策的内容放在报告里</h2>
          </div>
          <div className="value-grid">
            <article>
              <Calculator size={22} weight="duotone" />
              <h3>看清真实成本</h3>
              <p>金额、期限、费用、现金流和真实年化</p>
            </article>
            <article>
              <ClipboardText size={22} weight="duotone" />
              <h3>识别关键风险</h3>
              <p>提前还款、逾期、费用、仲裁和送达条款</p>
            </article>
            <article>
              <Receipt size={22} weight="duotone" />
              <h3>生成行动清单</h3>
              <p>告诉用户要核对什么、保存什么、下一步怎么做</p>
            </article>
          </div>
        </section>

        <div className="upload-mascot" aria-hidden="true">
          <Robot size={24} weight="duotone" />
        </div>
      </main>
    </PageShell>
  );
}
