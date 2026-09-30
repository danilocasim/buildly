import { useState } from "react";
import { View } from "react-native";
import { Button, EmptyState, ListRow, Screen, TextField } from "../components";
import { useRecords } from "../data/store";
import { entries, tags } from "../data/models";

export function TagsScreen() {
  const { records: allTags } = useRecords(tags);
  const { records: allEntries } = useRecords(entries);
  const [name, setName] = useState("");

  const addTag = async () => {
    await tags.create({ name: name.trim() });
    setName("");
  };

  return (
    <Screen testID="tags-screen">
      <TextField
        label="New tag"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Travel"
        testID="tags-name"
      />
      <Button label="Add tag" disabled={!name.trim()} onPress={addTag} testID="tags-add" />
      {allTags.length === 0 ? (
        <EmptyState title="No tags yet" body="Tags group related entries." />
      ) : (
        <View>
          {[...allTags]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((tag) => {
              const count = allEntries.filter((entry) => entry.tagIds.includes(tag.id)).length;
              return (
                <ListRow
                  key={tag.id}
                  title={tag.name}
                  detail={`${count} ${count === 1 ? "entry" : "entries"}`}
                  testID={`tag-row-${tag.name}`}
                />
              );
            })}
        </View>
      )}
    </Screen>
  );
}
