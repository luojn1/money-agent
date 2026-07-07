import { ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { Calculator } from "@phosphor-icons/react/Calculator";
import { Check } from "@phosphor-icons/react/Check";
import { ClipboardText } from "@phosphor-icons/react/ClipboardText";
import { Clock } from "@phosphor-icons/react/Clock";
import { FileMagnifyingGlass } from "@phosphor-icons/react/FileMagnifyingGlass";
import { Robot } from "@phosphor-icons/react/Robot";
import { SealWarning } from "@phosphor-icons/react/SealWarning";
import { ShieldWarning } from "@phosphor-icons/react/ShieldWarning";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { api } from "../services/api";
import type { AgentStepStatus, PipelineStatus, PipelineStep } from "../types/pipeline";

const statusText: Record<AgentStepStatus, string> = {
  pending: "等待中",
  processing: "处理中",
  completed: "已完成",
  partial: "部分完成",
  failed: "失败",
};

const stepIcons = {
  contract_cost: Calculator,
  risk_case: ShieldWarning,
  recommendation_action: ClipboardText,
};

type LocationState = { contractName?: string } | null;

const progressWidth = (steps: PipelineStep[]) => {
  const completed = steps.filter((step) => step.status === "completed" || step.status === "partial").length;
  const processing = steps.some((step) => step.status === "processing") ? 0.55 : 0;
  const ratio = Math.min(1, (completed + processing) / steps.length);
  return `${Math.max(14, ratio * 100)}%`;
};

export function AnalysisPage() {
  const { taskId = "mock_bcd_demo" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState;
  const storedName = sessionStorage.getItem(`analysis:${taskId}:contractName`);
  const fallbackContractName = state?.contractName ?? storedName ?? "课程项目测试合同.txt";
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const nextStatus = await api.getAnalysisStatus(taskId);
        if (disposed) return;
        setStatus(nextStatus);
        setError(nextStatus.error ?? "");

        if (nextStatus.status === "completed") {
          timer = setTimeout(() => navigate(`/report/${taskId}`, { replace: true }), 520);
          return;
        }

        if (nextStatus.status !== "failed") {
          timer = setTimeout(poll, 520);
        }
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

  const contractName = status?.contractName ?? fallbackContractName;
  const activeStep = useMemo(
    () => status?.steps.find((step) => step.status === "processing"),
    [status?.steps],
  );

  return (
    <PageShell compactHeader>
      <main className="analysis-page">
        <Link className="back-link" to="/"><ArrowLeft size={18} />返回上传页</Link>
        <section className="progress-panel" aria-labelledby="analysis-title">
          <p className="eyebrow">合同体检进行中</p>
          <h1 id="analysis-title">B/C/D Pipeline 正在整理合同报告</h1>
          <p className="contract-file"><FileMagnifyingGlass size={19} weight="duotone" />{contractName}</p>

          <div className={`pipeline-mode-card${status?.mode === "integrated" ? " pipeline-mode-card--real" : ""}`}>
            <Robot size={22} weight="duotone" />
            <div>
              <strong>{status?.mode === "integrated" ? "真实多 Agent 分析" : "演示数据模式"}</strong>
              <span>
                {status?.mode === "integrated"
                  ? `runtimeMode = ${status.runtimeMode ?? "INTEGRATED"}`
                  : "正在使用静态 Mock 数据演示完整链路，未调用真实 C/D Agent。"}
              </span>
            </div>
          </div>

          <div className="progress-summary">
            <span>{activeStep ? `当前执行：${activeStep.label}` : status?.currentMessage ?? "准备开始分析"}</span>
            <strong>{status?.currentStage === "completed" ? "报告生成完成" : status?.currentMessage ?? "合同读取中"}</strong>
          </div>
          <div className="progress-track" aria-label="分析阶段进度">
            <span style={{ width: status ? progressWidth(status.steps) : "14%" }} />
          </div>

          <ol className="analysis-steps">
            {(status?.steps ?? []).map((step) => {
              const IconComponent = step.status === "completed" ? Check : step.status === "failed" ? SealWarning : stepIcons[step.agent];
              return (
                <li key={step.agent} className={`is-${step.status}`}>
                  <span className="step-icon" aria-hidden="true">
                    <IconComponent size={22} weight={step.status === "completed" ? "bold" : "duotone"} />
                  </span>
                  <span>
                    <strong>{step.label}</strong>
                    <small>{step.message ?? statusText[step.status]}</small>
                  </span>
                  <span className={`agent-status agent-status--step agent-status--${step.status}`}>{statusText[step.status]}</span>
                  {step.status === "processing" && <span className="step-pulse" aria-label="处理中" />}
                </li>
              );
            })}
          </ol>

          {!status && !error && (
            <div className="loading-inline">
              <Clock size={18} weight="duotone" />
              <span>正在读取任务状态…</span>
            </div>
          )}

          {error && (
            <div className="inline-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => {
                setError("");
                setRetryKey((value) => value + 1);
              }}>
                重新加载
              </button>
            </div>
          )}

          <div className="analysis-actions">
            <Link className="secondary-button" to="/">
              <ArrowCounterClockwise size={18} />
              重新分析
            </Link>
          </div>
          <p className="progress-note">演示数据模式约 3 至 6 秒完成；真实模式进度来自后端实际 B/C/D 执行状态。</p>
        </section>
      </main>
    </PageShell>
  );
}
