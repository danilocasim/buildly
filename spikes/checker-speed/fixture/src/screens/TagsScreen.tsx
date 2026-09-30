import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Button, EmptyState, ListRow, Screen, TextField } from "../components";
import { tags, type Tag } from "../data/models";

export function TagsScreen() {
  const [items, setItems] = useState<Tag[]>([]);
  const [name, setName] = useState("");

  const refresh = useCallback(() => {
    tags.list().then((list) => setItems([...list].sort((a, b) => a.name.localeCompare(b.name))));
  }, []);
  useFocusEffect(refresh);

  return (
    <Screen testID="tags-screen">
      <TextField label="New tag" value={name} onChangeText={setName} testID="tags-name" />
      <Button
        label="Add tag"
        disabled={!name.trim()}
        onPress={async () => {
          await tags.create({ name: name.trim(), color: "#4f46e5" });
          setName("");
          refresh();
        }}
      />
      {items.length === 0 ? <EmptyState title="No tags" /> : items.map((tag) => <ListRow key={tag.id} title={tag.name} />)}
    </Screen>
  );
}
