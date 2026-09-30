import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";

export interface CardProps {
  children: ReactNode;
  /** Makes the whole card pressable. */
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({ children, onPress, disabled, style, testID }: CardProps) {
  const t = useTheme();
  const cardStyle: StyleProp<ViewStyle> = [
    {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.color.border,
      padding: t.space.lg,
      gap: t.space.sm,
      opacity: disabled ? 0.5 : 1,
    },
    t.shadow.card,
    style,
  ];
  if (!onPress) {
    return (
      <View testID={testID} style={cardStyle}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={cardStyle}
    >
      {children}
    </Pressable>
  );
}
