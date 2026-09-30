import { useCallback, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { EmptyState, FAB, ListRow, Screen, TextField } from "../components";
import { entries, type Entry } from "../data/models";
import type { RootStackParamList } from "../navigation";

export function EntriesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Entry[]>([]);

  useFocusEffect(
    useCallback(() => {
      entries.search(query).then(setItems);
    }, [query]),
  );

  return (
    <Screen testID="entries-screen">
      <TextField label="Search" value={query} onChangeText={setQuery} testID="entries-search" />
      {items.length === 0 ? (
        <EmptyState title="No entries yet" body="Tap + to write your first entry." />
      ) : (
        items.map((entry) => (
          <ListRow
            key={entry.id}
            title={entry.title}
            subtitle={new Date(entry.createdAt).toLocaleDateString()}
            onPress={() => navigation.navigate("EntryDetail", { id: entry.id })}
            testID={`entry-${entry.id}`}
          />
        ))
      )}
      <FAB onPress={() => navigation.navigate("NewEntry")} testID="entries-new" />
    </Screen>
  );
}
