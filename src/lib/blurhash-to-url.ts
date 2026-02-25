import { decode } from "blurhash";

/**
 * Convert a blurhash string to a data URL for use as a blur placeholder.
 * Uses a small 4x4 pixel SVG for a smooth blur effect with minimal size.
 * Compatible with both server (Node.js) and client (browser) environments.
 */
export function blurHashToDataURL(hash: string, width = 4, height = 4): string {
  const pixels = decode(hash, width, height);

  const svgPixels: string[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      svgPixels.push(
        `<rect x="${x}" y="${y}" width="1" height="1" fill="rgb(${r},${g},${b})"/>`
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${svgPixels.join("")}</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Lightweight version: creates an average-color data URL from blurhash.
 * Much faster than full pixel rendering - good for simple color placeholders.
 */
export function blurHashToAvgColor(hash: string): string {
  const pixels = decode(hash, 4, 4);
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < 16; i++) {
    r += pixels[i * 4];
    g += pixels[i * 4 + 1];
    b += pixels[i * 4 + 2];
  }
  r = Math.round(r / 16);
  g = Math.round(g / 16);
  b = Math.round(b / 16);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect fill="rgb(${r},${g},${b})" width="1" height="1"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
