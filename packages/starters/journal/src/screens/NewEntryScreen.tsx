import { useState } from "react";
import { Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, Screen, TextField } from "../components";
import { useRecords } from "../data/store";
import { entries, moods, tags, type Mood } from "../data/models";
import type { RootStackParamList } from "../navigation";
import { useTheme } from "../theme";

export function NewEntryScreen() {
  const t = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { records: allTags } = useRecords(tags);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<Mood>("good");
  const [tagIds, setTagIds] = useState<string[]>([]);

  const toggleTag = (id: string) =>
    setTagIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  return (
    <Screen testID="new-entry-screen">
      <TextField label="Title" value={title} onChangeText={setTitle} testID="new-entry-title" />
      <TextField
        label="Entry"
        value={body}
        onChangeText={setBody}
        multiline
        testID="new-entry-body"
      />
      <Text style={[t.type.small, { color: t.color.textMuted }]}>Mood</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }}>
        {moods.map((m) => (
          <Button
            key={m}
            label={m}
            variant={m === mood ? "primary" : "secondary"}
            onPress={() => setMood(m)}
            testID={`mood-${m}`}
          />
        ))}
      </View>
      {allTags.length ? (
        <Text style={[t.type.small, { color: t.color.textMuted }]}>Tags</Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }}>
        {allTags.map((tag) => (
          <Button
            key={tag.id}
            label={tag.name}
            variant={tagIds.includes(tag.id) ? "primary" : "secondary"}
            onPress={() => toggleTag(tag.id)}
            testID={`tag-${tag.name}`}
          />
        ))}
      </View>
      <Button
        label="Save entry"
        disabled={!title.trim()}
        onPress={async () => {
          await entries.create({ title: title.trim(), body: body.trim(), mood, tagIds });
          navigation.goBack();
        }}
        testID="new-entry-save"
      />
    </Screen>
  );
}
