import { Buffer } from "node:buffer";
import { extname } from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import type { DocumentIntakeMethod, DocumentIntakeResult } from "../../../../shared/analysis.js";
import { DEMO_CONTRACT_NAME, DEMO_CONTRACT_TEXT } from "./demoContract.js";

type UploadedFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

type IntakeInput = {
  taskId: string;
  file?: UploadedFile;
  pastedText?: string;
};

type ExtractedDocument = {
  method: DocumentIntakeMethod;
  text: string;
  confidence: number;
  warnings: string[];
  usedOcr: boolean;
};

export type DocumentIntakeOutput = {
  contractName: string;
  contractText: string;
  intakeResult: DocumentIntakeResult;
};

const normalizeExtractedText = (text: string) =>
  text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const previewText = (text: string) => normalizeExtractedText(text).slice(0, 180);

const extensionOf = (fileName: string) => extname(fileName).toLowerCase();

const looksLikePdf = (file: UploadedFile) =>
  file.mimetype === "application/pdf" || extensionOf(file.originalname) === ".pdf";

const looksLikeDocx = (file: UploadedFile) =>
  file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
  extensionOf(file.originalname) === ".docx";

const looksLikeText = (file: UploadedFile) =>
  file.mimetype.startsWith("text/") || [".txt", ".md", ".csv", ".json"].includes(extensionOf(file.originalname));

const looksLikeImage = (file: UploadedFile) =>
  file.mimetype.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp", ".bmp"].includes(extensionOf(file.originalname));

const extractPlainText = (file: UploadedFile): ExtractedDocument => ({
  method: "plain_text",
  text: normalizeExtractedText(file.buffer.toString("utf8")),
  confidence: 0.98,
  warnings: [],
  usedOcr: false,
});

const extractDocxText = async (file: UploadedFile): Promise<ExtractedDocument> => {
  const result = await mammoth.extractRawText({ buffer: file.buffer });
  return {
    method: "docx_text",
    text: normalizeExtractedText(result.value),
    confidence: result.value.trim().length > 0 ? 0.94 : 0.3,
    warnings: result.messages.map((message) => message.message),
    usedOcr: false,
  };
};

const extractPdfText = async (file: UploadedFile): Promise<ExtractedDocument> => {
  const parser = new PDFParse({ data: file.buffer });
  try {
    const result = await parser.getText();
    const text = normalizeExtractedText(result.text);
    return {
      method: "pdf_text_layer",
      text,
      confidence: text.length > 60 ? 0.9 : 0.42,
      warnings: text.length > 60 ? [] : ["PDF 文本层较少，可能是扫描件，建议上传清晰图片或粘贴合同文字。"],
      usedOcr: false,
    };
  } finally {
    await parser.destroy();
  }
};

const extractImageOcrText = async (file: UploadedFile): Promise<ExtractedDocument> => {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker(["chi_sim", "eng"], 1, {
      cacheMethod: "write",
    });
    const { data } = await worker.recognize(file.buffer);
    const text = normalizeExtractedText(data.text);
    return {
      method: "image_ocr",
      text,
      confidence: Math.max(0.35, Math.min(0.92, (data.confidence ?? 60) / 100)),
      warnings: text.length > 40 ? [] : ["图片 OCR 结果较短，请确认图片是否清晰、完整。"],
      usedOcr: true,
    };
  } catch {
    return {
      method: "image_ocr",
      text: "",
      confidence: 0,
      warnings: ["当前运行环境无法完成图片 OCR。请改用可复制文字的 PDF、Word，或直接粘贴合同文字。"],
      usedOcr: true,
    };
  } finally {
    if (worker) await worker.terminate();
  }
};

const extractUploadedFile = async (file: UploadedFile): Promise<ExtractedDocument> => {
  if (looksLikeText(file)) return extractPlainText(file);
  if (looksLikeDocx(file)) return extractDocxText(file);
  if (looksLikePdf(file)) return extractPdfText(file);
  if (looksLikeImage(file)) return extractImageOcrText(file);

  return {
    method: "unsupported_file",
    text: "",
    confidence: 0,
    warnings: ["暂不支持该文件格式，请上传 PDF、Word、图片，或直接粘贴合同文字。"],
    usedOcr: false,
  };
};

export const runDocumentIntakeAgent = async (input: IntakeInput): Promise<DocumentIntakeOutput> => {
  const pastedText = normalizeExtractedText(input.pastedText ?? "");

  if (!input.file && !pastedText) {
    return {
      contractName: DEMO_CONTRACT_NAME,
      contractText: DEMO_CONTRACT_TEXT,
      intakeResult: {
        taskId: input.taskId,
        contractName: DEMO_CONTRACT_NAME,
        method: "demo",
        sourceFileName: null,
        mimeType: null,
        extractedTextLength: DEMO_CONTRACT_TEXT.length,
        extractedTextPreview: previewText(DEMO_CONTRACT_TEXT),
        usedOcr: false,
        confidence: 0.96,
        warnings: [],
      },
    };
  }

  const extracted = input.file
    ? await extractUploadedFile(input.file)
    : {
        method: "pasted_text" as const,
        text: pastedText,
        confidence: 0.98,
        warnings: [],
        usedOcr: false,
      };

  const mergedText = normalizeExtractedText([extracted.text, pastedText && pastedText !== extracted.text ? pastedText : ""].filter(Boolean).join("\n\n"));
  const fallbackWarnings = mergedText ? [] : ["没有识别到可用于分析的合同文字，请补充清晰文件或粘贴合同全文。"];
  const contractName = input.file?.originalname ?? "粘贴的合同文字";

  return {
    contractName,
    contractText: mergedText || DEMO_CONTRACT_TEXT,
    intakeResult: {
      taskId: input.taskId,
      contractName,
      method: extracted.method,
      sourceFileName: input.file?.originalname ?? null,
      mimeType: input.file?.mimetype ?? null,
      extractedTextLength: mergedText.length,
      extractedTextPreview: previewText(mergedText),
      usedOcr: extracted.usedOcr,
      confidence: mergedText ? extracted.confidence : 0,
      warnings: [...extracted.warnings, ...fallbackWarnings],
    },
  };
};
