import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Short text on the right, such as a count or a date. */
  detail?: string;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}

export function ListRow({ title, subtitle, detail, onPress, disabled, testID }: ListRowProps) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? "button" : undefined}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: t.space.md,
        paddingVertical: t.space.md,
        paddingHorizontal: t.space.lg,
        backgroundColor: t.color.surface,
        borderBottomWidth: 1,
        borderColor: t.color.border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[t.type.body, { color: t.color.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[t.type.small, { color: t.color.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {detail ? <Text style={[t.type.small, { color: t.color.textMuted }]}>{detail}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={t.color.textMuted} /> : null}
    </Pressable>
  );
}
