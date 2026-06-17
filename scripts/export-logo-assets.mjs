#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(repoRoot, "assets", "openrepo-copilot-logo.svg");
const png = path.join(repoRoot, "assets", "openrepo-copilot-logo.png");
const trayPng = path.join(repoRoot, "assets", "openrepo-copilot-tray.png");
const ico = path.join(repoRoot, "assets", "openrepo-copilot-logo.ico");

const icoSizes = [16, 24, 32, 48, 64, 128, 256];

await sharp(source).resize(1024, 1024).png().toFile(png);
await sharp(source).resize(32, 32).png().toFile(trayPng);

const pngImages = await Promise.all(
  icoSizes.map(async (size) => ({
    size,
    buffer: await sharp(source).resize(size, size).png().toBuffer(),
  })),
);

fs.writeFileSync(ico, createIco(pngImages));
console.log(`Wrote ${path.relative(repoRoot, png)}`);
console.log(`Wrote ${path.relative(repoRoot, trayPng)}`);
console.log(`Wrote ${path.relative(repoRoot, ico)}`);

function createIco(images) {
  const headerSize = 6;
  const directorySize = images.length * 16;
  let offset = headerSize + directorySize;
  const totalSize = offset + images.reduce((sum, image) => sum + image.buffer.length, 0);
  const output = Buffer.alloc(totalSize);

  output.writeUInt16LE(0, 0);
  output.writeUInt16LE(1, 2);
  output.writeUInt16LE(images.length, 4);

  images.forEach((image, index) => {
    const entry = headerSize + index * 16;
    output.writeUInt8(image.size >= 256 ? 0 : image.size, entry);
    output.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1);
    output.writeUInt8(0, entry + 2);
    output.writeUInt8(0, entry + 3);
    output.writeUInt16LE(1, entry + 4);
    output.writeUInt16LE(32, entry + 6);
    output.writeUInt32LE(image.buffer.length, entry + 8);
    output.writeUInt32LE(offset, entry + 12);
    image.buffer.copy(output, offset);
    offset += image.buffer.length;
  });

  return output;
}
