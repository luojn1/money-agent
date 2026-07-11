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
  processing: "分析中",
  completed: "已生成",
  partial: "已生成",
  failed: "未完成",
};

const stepIcons = {
  contract_cost: Calculator,
  risk_case: ShieldWarning,
  recommendation_action: ClipboardText,
};

const stepText: Record<PipelineStep["agent"], { title: string; description: string; processing: string }> = {
  contract_cost: {
    title: "成本分析",
    description: "核对金额、费用、还款安排和真实年化",
    processing: "正在核对成本信息",
  },
  risk_case: {
    title: "风险识别",
    description: "识别重点条款和可能后果",
    processing: "正在识别风险条款",
  },
  recommendation_action: {
    title: "建议行动",
    description: "整理确认事项和行动清单",
    processing: "正在整理行动建议",
  },
};

type LocationState = { contractName?: string } | null;

const progressWidth = (steps: PipelineStep[]) => {
  const completed = steps.filter((step) => step.status === "completed" || step.status === "partial").length;
  const processing = steps.some((step) => step.status === "processing") ? 0.55 : 0;
  const ratio = Math.min(1, (completed + processing) / steps.length);
  return `${Math.max(14, ratio * 100)}%`;
};

const isReportReady = (status: AgentStepStatus | undefined) => status === "completed" || status === "partial";

const analysisFailureMessage = (status: PipelineStatus) => {
  if (status.errors?.some((error) => error.code === "document_intake_failed")) {
    return "没有识别到足够的合同文字，请上传清晰文件，或直接粘贴合同文字。";
  }
  if (status.errors?.some((error) => error.code === "PIPELINE_EXECUTION_FAILED")) {
    return "分析服务暂时不可用，请稍后重新分析。";
  }
  return "分析未完成，请稍后重试。";
};

const progressMessage = (status: PipelineStatus | null, reportReady: boolean) => {
  if (reportReady) return "分析结果已生成，正在打开";
  if (status?.status === "failed") return "分析未完成，请稍后重试";
  if (status?.status === "partial") return "分析已生成，部分关键信息待核对";
  return "正在整理合同分析结果";
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
        setError(nextStatus.error ? analysisFailureMessage(nextStatus) : "");

        if (isReportReady(nextStatus.status)) {
          timer = setTimeout(() => navigate(`/report/${taskId}`, { replace: true }), 520);
          return;
        }

        if (nextStatus.status !== "failed") {
          timer = setTimeout(poll, 520);
        }
      } catch {
        if (!disposed) {
          setError("无法连接分析服务，请检查网络后重新加载。");
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
  const reportReady = isReportReady(status?.status);

  return (
    <PageShell compactHeader>
      <main className="analysis-page">
        <Link className="back-link" to="/"><ArrowLeft size={18} />返回上传页</Link>
        <section className="progress-panel" aria-labelledby="analysis-title">
          <p className="eyebrow">{reportReady ? "合同体检已完成" : "合同体检进行中"}</p>
          <h1 id="analysis-title">{reportReady ? "合同分析已完成" : "正在整理合同分析结果"}</h1>
          <p className="contract-file"><FileMagnifyingGlass size={19} weight="duotone" />{contractName}</p>

          <div className={`pipeline-mode-card${status?.mode === "integrated" ? " pipeline-mode-card--real" : ""}`}>
            <Robot size={22} weight="duotone" />
            <div>
              <strong>{reportReady ? "合同分析已完成" : "合同分析进行中"}</strong>
              <span>系统会整理成本、风险和建议，结果仅供参考，请结合合同原文核实。</span>
            </div>
          </div>

          <div className="progress-summary">
            <span>{activeStep ? `当前阶段：${stepText[activeStep.agent].title}` : "准备分析合同"}</span>
            <strong>{progressMessage(status, reportReady)}</strong>
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
                    <strong>{stepText[step.agent].title}</strong>
                    <small>{step.status === "processing" ? stepText[step.agent].processing : stepText[step.agent].description}</small>
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
          <p className="progress-note">分析完成后会自动打开报告；如长时间无响应，可以重新上传合同再试。</p>
        </section>
      </main>
    </PageShell>
  );
}
