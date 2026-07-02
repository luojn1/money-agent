import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { Calculator } from "@phosphor-icons/react/Calculator";
import { Check } from "@phosphor-icons/react/Check";
import { FileMagnifyingGlass } from "@phosphor-icons/react/FileMagnifyingGlass";
import { Receipt } from "@phosphor-icons/react/Receipt";
import { ShieldWarning } from "@phosphor-icons/react/ShieldWarning";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { api } from "../services/api";

const steps = [
  { label: "正在读取文件", detail: "提取文本层，图片会尝试 OCR 识别", icon: FileMagnifyingGlass },
  { label: "正在解析合同", detail: "识别合同结构和关键段落", icon: FileMagnifyingGlass },
  { label: "正在提取金额和费用", detail: "整理借款、到账、还款与服务费", icon: Receipt },
  { label: "正在计算真实成本", detail: "调用知识库规则换算真实年化", icon: Calculator },
  { label: "正在检查风险条款", detail: "查找提前还款、逾期和授权范围", icon: ShieldWarning },
];

type LocationState = { contractName?: string } | null;

export function AnalysisPage() {
  const { taskId = "demo_001" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState;
  const storedName = sessionStorage.getItem(`analysis:${taskId}:contractName`);
  const contractName = state?.contractName ?? storedName ?? "示例消费贷合同.pdf";
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(8);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const status = await api.getAnalysisStatus(taskId);
        if (disposed) return;
        setCurrentStep(status.currentStep);
        setProgress(status.progress);
        setError("");

        if (status.status === "completed") {
          await api.getAnalysisResult(taskId);
          if (disposed) return;
          setProgress(100);
          timer = setTimeout(() => navigate(`/report/${taskId}`, { replace: true }), 450);
          return;
        }

        timer = setTimeout(poll, 780);
      } catch (requestError) {
        if (!disposed) {
          setError(requestError instanceof Error ? requestError.message : "分析进度暂时无法加载。");
        }
      }
    };

    void poll();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [navigate, retryKey, taskId]);

  return (
    <PageShell compactHeader>
      <main className="analysis-page">
        <Link className="back-link" to="/"><ArrowLeft size={18} />返回上传页</Link>
        <section className="progress-panel" aria-labelledby="analysis-title">
          <p className="eyebrow">合同体检进行中</p>
          <h1 id="analysis-title">正在把复杂条款，变成你看得懂的结果</h1>
          <p className="contract-file"><FileMagnifyingGlass size={19} weight="duotone" />{contractName}</p>

          <div className="progress-summary">
            <span>分析进度</span>
            <strong>{Math.round(progress)}%</strong>
          </div>
          <div className="progress-track" aria-label={`分析进度 ${Math.round(progress)}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>

          <ol className="analysis-steps">
            {steps.map((step, index) => {
              const complete = index < currentStep;
              const active = index === currentStep && currentStep < steps.length;
              const IconComponent = step.icon;
              return (
                <li key={step.label} className={`${complete ? "is-complete" : ""}${active ? " is-active" : ""}`}>
                  <span className="step-icon" aria-hidden="true">
                    {complete ? <Check size={20} weight="bold" /> : <IconComponent size={22} weight="duotone" />}
                  </span>
                  <span>
                    <strong>{step.label}</strong>
                    <small>{complete ? "已完成" : step.detail}</small>
                  </span>
                  {active && <span className="step-pulse" aria-label="处理中" />}
                </li>
              );
            })}
          </ol>

          {error && (
            <div className="inline-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setRetryKey((value) => value + 1)}>重新加载</button>
            </div>
          )}
          <p className="progress-note">识别和测算都在本地演示服务内完成，预计几秒后生成报告。</p>
        </section>
      </main>
    </PageShell>
  );
}
