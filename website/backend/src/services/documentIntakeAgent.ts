import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { extname, resolve } from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import type { DocumentIntakeMethod, DocumentIntakeResult } from "../../../../shared/analysis.js";

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
  pageCount: number | null;
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

export const normalizeUploadedFileName = (fileName: string) => {
  const decoded = Buffer.from(fileName, "latin1").toString("utf8");
  const looksMojibake = /[ÃÂÄÅÆÇÈÉÊËÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/.test(fileName);
  return looksMojibake && !decoded.includes("\uFFFD") ? decoded : fileName;
};

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

const ocrModelDir = resolve(process.env.PROJECT_ROOT?.trim() || process.cwd(), "website", "backend");

const extractPlainText = (file: UploadedFile): ExtractedDocument => ({
  method: "plain_text",
  text: normalizeExtractedText(file.buffer.toString("utf8")),
  confidence: 0.98,
  warnings: [],
  usedOcr: false,
  pageCount: null,
});

const extractDocxText = async (file: UploadedFile): Promise<ExtractedDocument> => {
  const result = await mammoth.extractRawText({ buffer: file.buffer });
  return {
    method: "docx_text",
    text: normalizeExtractedText(result.value),
    confidence: result.value.trim().length > 0 ? 0.94 : 0.3,
    warnings: result.messages.map((message) => message.message),
    usedOcr: false,
    pageCount: null,
  };
};

const extractPdfText = async (file: UploadedFile): Promise<ExtractedDocument> => {
  const parser = new PDFParse({ data: file.buffer });
  try {
    const info = await parser.getInfo().catch(() => null);
    const result = await parser.getText();
    const text = normalizeExtractedText(result.text);
    return {
      method: "pdf_text_layer",
      text,
      confidence: text.length > 60 ? 0.9 : 0.42,
      warnings: text.length > 60 ? [] : ["PDF 文本层较少，可能是扫描件，建议上传清晰图片或粘贴合同文字。"],
      usedOcr: false,
      pageCount: info?.total ?? null,
    };
  } finally {
    await parser.destroy();
  }
};

const extractImageOcrText = async (file: UploadedFile): Promise<ExtractedDocument> => {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker("chi_sim", 1, {
      cacheMethod: "write",
      cachePath: ocrModelDir,
    });
    const { data } = await worker.recognize(file.buffer);
    const text = normalizeExtractedText(data.text);
    return {
      method: "image_ocr",
      text,
      confidence: Math.max(0.35, Math.min(0.92, (data.confidence ?? 60) / 100)),
      warnings: text.length > 40 ? [] : ["图片 OCR 结果较短，请确认图片是否清晰、完整。"],
      usedOcr: true,
      pageCount: null,
    };
  } catch {
    return {
      method: "image_ocr",
      text: "",
      confidence: 0,
      warnings: ["当前运行环境无法完成图片 OCR。请改用可复制文字的 PDF、Word，或直接粘贴合同文字。"],
      usedOcr: true,
      pageCount: null,
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
    pageCount: null,
  };
};

const sha256 = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

export const runDocumentIntakeAgent = async (input: IntakeInput): Promise<DocumentIntakeOutput> => {
  const pastedText = normalizeExtractedText(input.pastedText ?? "");

  if (!input.file && !pastedText) {
    return {
      contractName: "未提供合同",
      contractText: "",
      intakeResult: {
        taskId: input.taskId,
        contractName: "未提供合同",
        method: "unsupported_file",
        sourceFileName: null,
        mimeType: null,
        fileSha256: null,
        pageCount: null,
        extractedTextLength: 0,
        extractedTextPreview: "",
        usedOcr: false,
        confidence: 0,
        warnings: ["未提供可分析的合同文件或合同文本。示例合同仅可通过 /api/analysis/demo 创建。"],
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
        pageCount: null,
      };

  const mergedText = normalizeExtractedText([extracted.text, pastedText && pastedText !== extracted.text ? pastedText : ""].filter(Boolean).join("\n\n"));
  const fallbackWarnings = mergedText ? [] : ["没有识别到可用于分析的合同文字，请补充清晰文件或粘贴合同全文；系统不会自动改用示例合同。"];
  const contractName = input.file ? normalizeUploadedFileName(input.file.originalname) : "粘贴的合同文字";

  return {
    contractName,
    contractText: mergedText,
    intakeResult: {
      taskId: input.taskId,
      contractName,
      method: extracted.method,
      sourceFileName: input.file ? normalizeUploadedFileName(input.file.originalname) : null,
      mimeType: input.file?.mimetype ?? null,
      fileSha256: input.file ? sha256(input.file.buffer) : null,
      pageCount: extracted.pageCount,
      extractedTextLength: mergedText.length,
      extractedTextPreview: previewText(mergedText),
      usedOcr: extracted.usedOcr,
      confidence: mergedText ? extracted.confidence : 0,
      warnings: [...extracted.warnings, ...fallbackWarnings],
    },
  };
};
