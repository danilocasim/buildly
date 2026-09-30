import { createContext, useContext, type ReactNode } from "react";

export const tokens = {
  color: {
    bg: "#f7f7f5",
    surface: "#ffffff",
    text: "#18181b",
    muted: "#71717a",
    line: "#e4e4e7",
    accent: "#4f46e5",
    danger: "#dc2626",
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { card: 12, pill: 999 },
  type: { body: 16, small: 13, title: 20, heading: 28 },
} as const;

export type Theme = typeof tokens;

const ThemeContext = createContext<Theme>(tokens);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
