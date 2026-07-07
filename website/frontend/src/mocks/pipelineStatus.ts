import type { PipelineStatus, PipelineStep, PipelineTaskCreated } from "../types/pipeline";

export const MOCK_PIPELINE_TOTAL_MS = 4_500;

const baseSteps = [
  {
    agent: "contract_cost",
    label: "B 合同与成本 Agent",
    status: "pending",
    message: "读取合同、抽取金额费用并测算真实成本",
  },
  {
    agent: "risk_case",
    label: "C 风险与案例 Agent",
    status: "pending",
    message: "识别风险条款并匹配典型情景",
  },
  {
    agent: "recommendation_action",
    label: "D 建议与行动 Agent",
    status: "pending",
    message: "生成确认清单、话术和行动计划",
  },
] satisfies [PipelineStep, PipelineStep, PipelineStep];

export const createMockPipelineTask = (): PipelineTaskCreated => {
  const now = Date.now();
  return {
    schemaVersion: "1.0.0",
    taskId: `mock_bcd_${now.toString(36)}`,
    contractId: "contract_mock_course_project_001",
    status: "processing",
    mode: "mock",
    createdAt: new Date(now).toISOString(),
  };
};

export const createRealPipelineUnavailableStatus = (
  taskId: string,
  contractName = "待接入合同",
): PipelineStatus => ({
  schemaVersion: "1.0.0",
  taskId,
  contractId: "contract_pending_real_pipeline",
  status: "failed",
  mode: "real_unconnected",
  contractName,
  currentStage: "failed",
  currentMessage: "真实 Pipeline 模式暂未接入，等待 B/C/D 分支确认后再联调。",
  steps: baseSteps.map((step) => ({ ...step, status: "pending" })),
  updatedAt: new Date().toISOString(),
  error: "真实 Pipeline 尚未接入。本页面不会使用旧 Mock 冒充真实 C/D 运行结果。",
});

export const createMockPipelineStatus = (
  taskId: string,
  startedAt: number,
  contractName: string,
): PipelineStatus => {
  const elapsed = Math.max(0, Date.now() - startedAt);
  const completed = elapsed >= MOCK_PIPELINE_TOTAL_MS;

  let currentMessage = "合同读取中";
  let currentStage: PipelineStatus["currentStage"] = "contract_cost";
  const steps = baseSteps.map((step) => ({ ...step })) as [PipelineStep, PipelineStep, PipelineStep];
  const [contractStep, riskStep, actionStep] = steps;

  if (elapsed < 1_100) {
    contractStep.status = "processing";
    contractStep.message = "合同读取中，正在定位本金、到账、还款和费用条款";
  } else if (elapsed < 2_000) {
    contractStep.status = "processing";
    contractStep.message = "B 成本测算中，正在生成现金流和真实年化";
    currentMessage = "B 合同与成本 Agent 正在测算";
  } else if (elapsed < 3_100) {
    contractStep.status = "completed";
    contractStep.message = "B 成本测算完成";
    riskStep.status = "processing";
    riskStep.message = "C 风险识别中，正在关联 clauseId 和典型情景";
    currentStage = "risk_case";
    currentMessage = "C 风险与案例 Agent 正在识别";
  } else if (!completed) {
    contractStep.status = "completed";
    contractStep.message = "B 成本测算完成";
    riskStep.status = "completed";
    riskStep.message = "C 风险识别完成";
    actionStep.status = "processing";
    actionStep.message = "D 建议生成中，正在整理行动方案";
    currentStage = "recommendation_action";
    currentMessage = "D 建议与行动 Agent 正在生成";
  } else {
    contractStep.status = "completed";
    contractStep.message = "B 成本测算完成";
    riskStep.status = "completed";
    riskStep.message = "C 风险识别完成";
    actionStep.status = "completed";
    actionStep.message = "D 建议生成完成";
    currentStage = "completed";
    currentMessage = "完整分析报告已生成";
  }

  return {
    schemaVersion: "1.0.0",
    taskId,
    contractId: "contract_mock_course_project_001",
    status: completed ? "completed" : "processing",
    mode: "mock",
    contractName,
    currentStage,
    currentMessage,
    steps,
    updatedAt: new Date().toISOString(),
  };
};
