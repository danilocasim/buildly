import { useState } from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { EmptyState, ListRow, Screen, TextField } from "../components";
import { useRecords } from "../data/store";
import { items } from "../data/models";
import type { RootStackParamList } from "../navigation";

export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState("");
  const { records, loading } = useRecords(items, query);

  return (
    <Screen testID="search-screen">
      <TextField
        label="Search items"
        value={query}
        onChangeText={setQuery}
        placeholder="Name, SKU, or location"
        testID="search-query"
      />
      {query && !loading && records.length === 0 ? <EmptyState title="No matches" /> : null}
      <View>
        {query
          ? records.map((item) => (
              <ListRow
                key={item.id}
                title={item.name}
                subtitle={`${item.sku} · ${item.location}`}
                detail={String(item.quantity)}
                onPress={() => navigation.navigate("ItemDetail", { id: item.id })}
                testID={`search-result-${item.sku}`}
              />
            ))
          : null}
      </View>
    </Screen>
  );
}
