import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";
import { Button } from "./Button";

export interface EmptyStateProps {
  title: string;
  body?: string;
  /** Optional call to action below the text. */
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export function EmptyState({ title, body, actionLabel, onAction, testID }: EmptyStateProps) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      style={{ alignItems: "center", gap: t.space.sm, paddingVertical: t.space.xxl }}
    >
      <Ionicons name="file-tray-outline" size={40} color={t.color.textMuted} />
      <Text style={[t.type.title, { color: t.color.text, textAlign: "center" }]}>{title}</Text>
      {body ? (
        <Text style={[t.type.body, { color: t.color.textMuted, textAlign: "center" }]}>{body}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          testID={testID ? `${testID}-action` : undefined}
        />
      ) : null}
    </View>
  );
}
