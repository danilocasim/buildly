import { createContext, useContext, type ReactNode } from "react";

// Brief §3 colors mapped to React Native values. Pairs used for text are checked for
// WCAG AA (4.5:1) in test/theme.test.ts. White text on the orange accent is only
// 2.96:1, so filled accent buttons use `onAccent` (near-black) and accent-colored text
// uses the darker `accentText`.
export const tokens = {
  color: {
    background: "#FAF9F7",
    surface: "#FFFFFF",
    text: "#171717",
    textMuted: "#737373",
    border: "#E8E5E1",
    accent: "#FF641A",
    accentSubtle: "#FFF0E6",
    accentText: "#C2410C",
    onAccent: "#171717",
    success: "#16A37B",
    danger: "#DC2626",
    onDanger: "#FFFFFF",
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 12, lg: 16, pill: 999 },
  type: {
    caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
    small: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
    body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
    label: { fontSize: 16, lineHeight: 24, fontWeight: "600" },
    title: { fontSize: 20, lineHeight: 28, fontWeight: "600" },
    heading: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  },
  shadow: {
    card: {
      shadowColor: "#171717",
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
  },
} as const;

export type Theme = typeof tokens;

const ThemeContext = createContext<Theme>(tokens);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
