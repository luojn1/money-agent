export const DEMO_TASK_ID = "demo_001";

export const createMockAnalysisResult = (taskId = DEMO_TASK_ID) => ({
  taskId,
  status: "completed",
  contractName: "示例消费贷合同.pdf",
});
