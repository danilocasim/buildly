import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";

export interface FABProps {
  onPress: () => void;
  /** Screen-reader label; defaults to "Add". */
  accessibilityLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  testID?: string;
}

/** Floating action button, bottom right. Place it as the last child of a non-scrolling parent. */
export function FAB({
  onPress,
  accessibilityLabel = "Add",
  icon = "add",
  disabled,
  testID,
}: FABProps) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          position: "absolute",
          right: t.space.xl,
          bottom: t.space.xl,
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.color.accent,
          opacity: disabled ? 0.5 : 1,
        },
        t.shadow.card,
      ]}
    >
      <Ionicons name={icon} size={28} color={t.color.onAccent} />
    </Pressable>
  );
}
