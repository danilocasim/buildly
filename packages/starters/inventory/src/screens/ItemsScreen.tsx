import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { DemoDataPill, EmptyState, ListRow, Screen } from "../components";
import { useRecords } from "../data/store";
import { isLowStock, items } from "../data/models";
import type { RootStackParamList } from "../navigation";

export function ItemsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { records, loading } = useRecords(items);
  const sorted = [...records].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Screen testID="items-screen">
      <DemoDataPill />
      {!loading && sorted.length === 0 ? <EmptyState title="No items yet" /> : null}
      <View>
        {sorted.map((item) => (
          <ListRow
            key={item.id}
            title={item.name}
            subtitle={`${item.sku} · ${item.location}${isLowStock(item) ? " · Low stock" : ""}`}
            detail={String(item.quantity)}
            onPress={() => navigation.navigate("ItemDetail", { id: item.id })}
            testID={`item-row-${item.sku}`}
          />
        ))}
      </View>
    </Screen>
  );
}
