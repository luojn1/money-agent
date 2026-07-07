import { execFile, type ExecFileException } from "node:child_process";

export type PythonRunResult = {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
};

export class PythonAgentError extends Error {
  readonly code = "PYTHON_AGENT_FAILED";
  readonly stdout: string;
  readonly stderr: string;

  constructor(message: string, stdout = "", stderr = "") {
    super(message);
    this.name = "PythonAgentError";
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

type PythonCommand = {
  command: string;
  prefixArgs: string[];
};

const splitCommand = (value: string): PythonCommand => {
  const tokens = value.match(/"[^"]+"|'[^']+'|\S+/g)?.map((token) => token.replace(/^["']|["']$/g, "")) ?? [];
  const [command, ...prefixArgs] = tokens;
  return { command: command || value, prefixArgs };
};

const pythonCandidates = (): PythonCommand[] => {
  if (process.env.PYTHON_BIN?.trim()) return [splitCommand(process.env.PYTHON_BIN.trim())];
  return [
    { command: "python", prefixArgs: [] },
    { command: "py", prefixArgs: ["-3"] },
    { command: "python3", prefixArgs: [] },
  ];
};

const isCommandMissing = (error: ExecFileException) =>
  error.code === "ENOENT" || error.message.includes("not recognized") || error.message.includes("was not found");

const execPython = (candidate: PythonCommand, args: string[], cwd: string, timeoutMs: number) =>
  new Promise<PythonRunResult>((resolve, reject) => {
    const finalArgs = [...candidate.prefixArgs, ...args];
    execFile(
      candidate.command,
      finalArgs,
      {
        cwd,
        timeout: timeoutMs,
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
        },
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }));
          return;
        }
        resolve({ command: candidate.command, args: finalArgs, stdout, stderr });
      },
    );
  });

export const runPythonAgent = async (input: {
  cwd: string;
  args: string[];
  label: string;
  timeoutMs?: number;
}): Promise<PythonRunResult> => {
  const candidates = pythonCandidates();
  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      return await execPython(candidate, input.args, input.cwd, input.timeoutMs ?? 180_000);
    } catch (error) {
      const execError = error as ExecFileException & { stdout?: string; stderr?: string };
      if (isCommandMissing(execError) && !process.env.PYTHON_BIN) {
        failures.push(`${candidate.command}: not found`);
        continue;
      }

      const detail = (execError.stderr || execError.stdout || execError.message || "").trim();
      throw new PythonAgentError(
        `${input.label} 执行失败。${detail ? "请查看后端日志或 .runtime 运行文件定位原因。" : ""}`,
        execError.stdout,
        execError.stderr,
      );
    }
  }

  throw new PythonAgentError(`未找到可用 Python。已尝试：${failures.join("；") || candidates.map((item) => item.command).join("、")}`);
};
