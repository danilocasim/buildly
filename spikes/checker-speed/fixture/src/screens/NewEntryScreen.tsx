import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Screen, TextField } from "../components";
import { entries, type Entry } from "../data/models";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "NewEntry">;
const moods: Entry["mood"][] = ["great", "good", "okay", "bad"];

export function NewEntryScreen({ navigation }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<Entry["mood"]>("good");

  return (
    <Screen testID="new-entry-screen">
      <TextField label="Title" value={title} onChangeText={setTitle} testID="new-entry-title" />
      <TextField label="Body" value={body} onChangeText={setBody} multiline testID="new-entry-body" />
      {moods.map((m) => (
        <Button key={m} label={m === mood ? `● ${m}` : m} onPress={() => setMood(m)} />
      ))}
      <Button
        label="Save"
        disabled={!title.trim()}
        onPress={async () => {
          await entries.create({ title: title.trim(), body, mood, tagIds: [] });
          navigation.goBack();
        }}
        testID="new-entry-save"
      />
    </Screen>
  );
}
