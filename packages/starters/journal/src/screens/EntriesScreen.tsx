import { useState } from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { DemoDataPill, EmptyState, FAB, ListRow, Screen, TextField } from "../components";
import { useRecords } from "../data/store";
import { entries, sortEntries } from "../data/models";
import type { RootStackParamList } from "../navigation";

export function EntriesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState("");
  const { records, loading } = useRecords(entries, query);

  return (
    <View style={{ flex: 1 }}>
      <Screen testID="entries-screen">
        <DemoDataPill />
        <TextField
          label="Search"
          value={query}
          onChangeText={setQuery}
          placeholder="Title or text"
          testID="entries-search"
        />
        {!loading && records.length === 0 ? (
          <EmptyState
            title={query ? "No matching entries" : "No entries yet"}
            body={query ? "Try another word." : "Tap + to write your first entry."}
          />
        ) : (
          <View>
            {sortEntries(records).map((entry) => (
              <ListRow
                key={entry.id}
                title={entry.title}
                subtitle={entry.body}
                detail={new Date(entry.createdAt).toLocaleDateString()}
                onPress={() => navigation.navigate("EntryDetail", { id: entry.id })}
                testID={`entry-${entry.id}`}
              />
            ))}
          </View>
        )}
      </Screen>
      <FAB
        accessibilityLabel="New entry"
        onPress={() => navigation.navigate("NewEntry")}
        testID="entries-new"
      />
    </View>
  );
}
