import { Text, View } from "react-native";
import { useHasDemoData } from "../data/store";
import { useTheme } from "../theme";

/** "Demo data" label shown while any seeded demo record exists. Put it on each Home tab. */
export function DemoDataPill({ testID = "demo-data-pill" }: { testID?: string }) {
  const t = useTheme();
  const visible = useHasDemoData();
  if (!visible) return null;
  return (
    <View
      testID={testID}
      style={{
        alignSelf: "flex-start",
        backgroundColor: t.color.accentSubtle,
        borderRadius: t.radius.pill,
        paddingHorizontal: t.space.md,
        paddingVertical: t.space.xs,
      }}
    >
      <Text style={[t.type.caption, { color: t.color.accentText, fontWeight: "600" }]}>
        Demo data
      </Text>
    </View>
  );
}
