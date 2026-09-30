import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../theme";

/** One-time banner after a schemaVersion change wiped and reseeded the data. */
export function ReseedNotice({
  visible,
  testID = "reseed-notice",
}: {
  visible: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const [dismissed, setDismissed] = useState(false);
  if (!visible || dismissed) return null;
  return (
    <View
      testID={testID}
      style={{
        position: "absolute",
        left: t.space.lg,
        right: t.space.lg,
        bottom: t.space.xxl * 2,
        flexDirection: "row",
        alignItems: "center",
        gap: t.space.md,
        padding: t.space.md,
        borderRadius: t.radius.md,
        backgroundColor: t.color.text,
      }}
    >
      <Text style={[t.type.small, { flex: 1, color: t.color.surface }]}>
        The app's data model changed, so demo data was reset.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => setDismissed(true)}
        testID={`${testID}-dismiss`}
      >
        <Text style={[t.type.label, { color: t.color.accent }]}>OK</Text>
      </Pressable>
    </View>
  );
}
