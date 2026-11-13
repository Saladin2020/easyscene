import { readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import type { RgbaImage } from "../shared/raster.js";

/** Encode an RGBA image as an 8-bit PNG buffer. */
export function encodePng(img: RgbaImage): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  return PNG.sync.write(png);
}

export function decodePng(buf: Buffer): RgbaImage {
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

export async function readPng(file: string): Promise<RgbaImage> {
  return decodePng(await readFile(file));
}

export async function writePng(file: string, img: RgbaImage): Promise<void> {
  await writeFile(file, encodePng(img));
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}
