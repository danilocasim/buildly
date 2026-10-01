// QR rendering for the Open on phone modal (TODO 5.4.1). The modules come from `qrcode`;
// the SVG keeps the modal free of canvas, and `qrBitmap` gives tests pixels to decode.
import QRCode from "qrcode";

export interface QrModules {
  size: number;
  /** Row-major; true is a dark module. */
  dark: boolean[];
}

export function qrModules(text: string): QrModules {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  return { size: modules.size, dark: Array.from(modules.data, (bit) => bit === 1) };
}

/** One path covering every dark module, for `<path d>` in a `size`×`size` viewBox. */
export function qrPath({ size, dark }: QrModules): string {
  const parts: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (dark[y * size + x]) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return parts.join("");
}

/** RGBA pixels of the code with a quiet zone, `scale` pixels per module (for decoders). */
export function qrBitmap(modules: QrModules, scale = 4, quiet = 4) {
  const width = (modules.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) {
      if (!modules.dark[y * modules.size + x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = ((y + quiet) * scale + dy) * width + (x + quiet) * scale + dx;
          data[px * 4] = 0;
          data[px * 4 + 1] = 0;
          data[px * 4 + 2] = 0;
        }
      }
    }
  }
  return { data, width, height: width };
}
