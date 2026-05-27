import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { UploadedDocument } from "./types.js";

const ALLOWED_EXTENSIONS = new Set([".md", ".txt", ".pdf", ".docx"]);

export function assertSupportedDocument(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported document format for ${fileName}. Supported: md, txt, pdf, docx.`);
  }
  return ext;
}

export function decodeUploadedDocument(file: UploadedDocument): Buffer {
  if (!file.name || !file.contentBase64) {
    throw new Error("Uploaded documents require name and contentBase64.");
  }
  assertSupportedDocument(file.name);
  return Buffer.from(file.contentBase64, "base64");
}

export function convertDocumentToMarkdown(fileName: string, buffer: Buffer): string {
  const ext = assertSupportedDocument(fileName);
  if (ext === ".md" || ext === ".txt") return buffer.toString("utf8");
  if (ext === ".docx") return extractDocxText(buffer);
  return extractPdfText(buffer);
}

export function writeDocumentKnowledgeBase(files: UploadedDocument[], sourcePath: string): string[] {
  if (files.length === 0) throw new Error("Upload at least one document.");

  const originalsDir = path.join(sourcePath, "originals");
  fs.mkdirSync(originalsDir, { recursive: true });

  const names: string[] = [];
  const sections: string[] = [];
  for (const file of files) {
    const safeName = path.basename(file.name);
    const buffer = decodeUploadedDocument({ ...file, name: safeName });
    const originalPath = path.join(originalsDir, safeName);
    fs.writeFileSync(originalPath, buffer);
    names.push(safeName);

    const markdown = convertDocumentToMarkdown(safeName, buffer).trim();
    sections.push(`# ${safeName}\n\n${markdown || "_No extractable text found._"}`);
  }

  fs.writeFileSync(path.join(sourcePath, "knowledge.md"), `${sections.join("\n\n---\n\n")}\n`, "utf8");
  return names;
}

function extractPdfText(buffer: Buffer): string {
  const text = buffer.toString("latin1");
  const matches = [...text.matchAll(/\(([^()\r\n]{2,})\)\s*Tj/g)].map((m) => m[1]);
  const arrayMatches = [...text.matchAll(/\[((?:\([^()]*\)\s*)+)\]\s*TJ/g)]
    .map((m) => [...m[1].matchAll(/\(([^()]*)\)/g)].map((part) => part[1]).join(""));
  const combined = [...matches, ...arrayMatches]
    .map((value) => value.replace(/\\([()\\])/g, "$1").replace(/\\n/g, "\n"))
    .join("\n");
  return combined.trim() || "PDF text extraction found no plain text streams.";
}

function extractDocxText(buffer: Buffer): string {
  const entry = readZipEntry(buffer, "word/document.xml");
  if (!entry) return "DOCX text extraction could not find word/document.xml.";
  return entry
    .toString("utf8")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readZipEntry(buffer: Buffer, wantedName: string): Buffer | null {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) return null;

  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
  let offset = centralDirectoryOffset;

  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    if (name === wantedName) {
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return zlib.inflateRawSync(compressed);
      throw new Error(`Unsupported DOCX compression method ${method}.`);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}
