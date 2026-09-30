import Constants from "expo-constants";
import { Text } from "react-native";
import { useTheme } from "../theme";
import { Card } from "./Card";
import { Screen } from "./Screen";

function attributionEnabled(): boolean {
  // app.json → expo.extra.showAttribution; true unless the export turns it off (Pro).
  return Constants.expoConfig?.extra?.showAttribution !== false;
}

/** Foundation-owned About screen; register it in src/navigation.tsx. */
export function AboutScreen() {
  const t = useTheme();
  const name = Constants.expoConfig?.name ?? "This app";
  return (
    <Screen testID="about-screen">
      <Card>
        <Text style={[t.type.title, { color: t.color.text }]}>{name}</Text>
        <Text style={[t.type.body, { color: t.color.textMuted }]}>
          Built with React Native and Expo. Your data stays on this device.
        </Text>
        {attributionEnabled() ? (
          <Text testID="about-attribution" style={[t.type.small, { color: t.color.textMuted }]}>
            Made with Buildly
          </Text>
        ) : null}
      </Card>
    </Screen>
  );
}
