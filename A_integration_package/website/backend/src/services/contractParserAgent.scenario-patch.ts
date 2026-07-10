// 在 website/backend/src/services/contractParserAgent.ts 中合并以下改动。

// 1. 顶部 import 增加：
import { detectContractTypeFromText } from "./scenarioDetector.js";

// 2. 删除或替换原来的 detectContractType 函数：
// const detectContractType = (text: string): ContractType => { ... };

// 3. 改为：
const detectContractType = detectContractTypeFromText;

// 4. runContractParserAgent 中这一行无需改名，保持原调用即可：
// const contractType = detectContractType(input.contractText);

