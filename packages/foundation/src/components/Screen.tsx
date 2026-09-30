import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useTheme } from "../theme";

export interface ScreenProps {
  children: ReactNode;
  /** Scrolls by default; pass false for screens that manage their own list or layout. */
  scroll?: boolean;
  testID?: string;
}

/** Page container: background color and padding. Headers come from the navigator. */
export function Screen({ children, scroll = true, testID }: ScreenProps) {
  const t = useTheme();
  if (!scroll) {
    return (
      <View
        testID={testID}
        style={{ flex: 1, backgroundColor: t.color.background, padding: t.space.lg }}
      >
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      testID={testID}
      style={{ flex: 1, backgroundColor: t.color.background }}
      contentContainerStyle={{
        padding: t.space.lg,
        gap: t.space.md,
        paddingBottom: t.space.xxl * 2,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
