import { Text } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, Card, EmptyState, Screen } from "../components";
import { useRecord, useRecords } from "../data/store";
import { entries, tags } from "../data/models";
import type { RootStackParamList } from "../navigation";
import { useTheme } from "../theme";

export function EntryDetailScreen() {
  const t = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, "EntryDetail">>();
  const entry = useRecord(entries, params.id);
  const { records: allTags } = useRecords(tags);

  if (!entry) {
    return (
      <Screen>
        <EmptyState title="Entry not found" />
      </Screen>
    );
  }

  const tagNames = allTags.filter((tag) => entry.tagIds.includes(tag.id)).map((tag) => tag.name);

  return (
    <Screen testID="entry-detail-screen">
      <Card>
        <Text style={[t.type.heading, { color: t.color.text }]}>{entry.title}</Text>
        <Text style={[t.type.small, { color: t.color.textMuted }]}>
          {new Date(entry.createdAt).toLocaleString()} · Mood: {entry.mood}
          {tagNames.length ? ` · ${tagNames.join(", ")}` : ""}
        </Text>
        <Text style={[t.type.body, { color: t.color.text }]}>{entry.body}</Text>
      </Card>
      <Button
        label="Delete entry"
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
