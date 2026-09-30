import { tokens } from "../src/theme";

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

describe("theme tokens", () => {
  it("match the snapshot", () => {
    expect(tokens).toMatchSnapshot();
  });

  it("use the brief §3 colors", () => {
    expect(tokens.color).toMatchObject({
      background: "#FAF9F7",
      surface: "#FFFFFF",
      text: "#171717",
      textMuted: "#737373",
      border: "#E8E5E1",
      accent: "#FF641A",
      accentSubtle: "#FFF0E6",
      success: "#16A37B",
    });
  });

  const c = tokens.color;
  it.each([
    ["text on background", c.text, c.background],
    ["text on surface", c.text, c.surface],
    ["muted text on background", c.textMuted, c.background],
    ["muted text on surface", c.textMuted, c.surface],
    ["onAccent on accent (primary button)", c.onAccent, c.accent],
    ["onDanger on danger (danger button)", c.onDanger, c.danger],
    ["accentText on accentSubtle (demo pill)", c.accentText, c.accentSubtle],
    ["surface on text (reseed notice)", c.surface, c.text],
  ])("%s meets WCAG AA (4.5:1)", (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
