import { useState } from "react";
import { Pressable, Text } from "react-native";
import { useTheme } from "../theme";
import { reportRuntimeError } from "./ErrorBoundary";

export interface ButtonProps {
  label: string;
  /** May be async: the button stays disabled until the promise settles, so a double tap cannot save twice. */
  onPress: () => void | Promise<unknown>;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  testID?: string;
}

export function Button({ label, onPress, variant = "primary", disabled, testID }: ButtonProps) {
  const t = useTheme();
  const [pending, setPending] = useState(false);
  const inactive = !!disabled || pending;
  const colors = {
    primary: { background: t.color.accent, text: t.color.onAccent, border: t.color.accent },
    secondary: { background: t.color.surface, text: t.color.text, border: t.color.border },
    danger: { background: t.color.danger, text: t.color.onDanger, border: t.color.danger },
  }[variant];

  const handlePress = () => {
    const result = onPress();
    if (result instanceof Promise) {
      setPending(true);
      result
        .catch((error: unknown) => reportRuntimeError(error, false))
        .finally(() => setPending(false));
    }
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: pending }}
      disabled={inactive}
      onPress={handlePress}
      style={({ pressed }) => ({
        alignItems: "center",
        justifyContent: "center",
        minHeight: 48,
        paddingHorizontal: t.space.lg,
        borderRadius: t.radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={[t.type.label, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}
