import { useEffect, useState } from "react";
import { Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Card, Screen } from "../components";
import { entries, type Entry } from "../data/models";
import type { RootStackParamList } from "../navigation";
import { useTheme } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "EntryDetail">;

export function EntryDetailScreen({ route, navigation }: Props) {
  const t = useTheme();
  const [entry, setEntry] = useState<Entry | undefined>();

  useEffect(() => {
    entries.get(route.params.id).then(setEntry);
  }, [route.params.id]);

  if (!entry) return <Screen>{null}</Screen>;

  return (
    <Screen testID="entry-detail-screen">
      <Card>
        <Text style={{ fontSize: t.type.heading, color: t.color.text }}>{entry.title}</Text>
        <Text style={{ color: t.color.muted, marginBottom: t.space.md }}>Mood: {entry.mood}</Text>
        <Text style={{ fontSize: t.type.body, color: t.color.text }}>{entry.body}</Text>
      </Card>
      <Button
        label="Delete"
        variant="danger"
        onPress={async () => {
          await entries.remove(entry.id);
          navigation.goBack();
        }}
        testID="entry-delete"
      />
    </Screen>
  );
}
