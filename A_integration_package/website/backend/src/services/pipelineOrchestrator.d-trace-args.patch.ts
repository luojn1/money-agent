// 在 website/backend/src/services/pipelineOrchestrator.ts 中，
// 找到调用 D Agent 的 runPythonAgent args 数组：
//
// await runPythonAgent({
//   cwd: recommendationActionDir,
//   label: "D 建议行动 Agent",
//   args: [
//     "main.py",
//     "--input-b",
//     bPath,
//     "--input-c",
//     cPath,
//     "--output",
//     dPath,
//     "--action-plan",
//     dActionPlanPath,
//     "--schema",
//     schemaPath,
//   ],
// });
//
// 将 args 替换为下面这个版本，新增 --input-c-trace cTracePath。

const dAgentArgsWithCTrace = [
  "main.py",
  "--input-b",
  bPath,
  "--input-c",
  cPath,
  "--input-c-trace",
  cTracePath,
  "--output",
  dPath,
  "--action-plan",
  dActionPlanPath,
  "--schema",
  schemaPath,
];

