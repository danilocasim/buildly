import { Text, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, Card, EmptyState, ListRow, Screen } from "../components";
import { useRecord, useRecords } from "../data/store";
import { adjustments, isLowStock, items } from "../data/models";
import type { RootStackParamList } from "../navigation";
import { useTheme } from "../theme";

export function ItemDetailScreen() {
  const t = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, "ItemDetail">>();
  const item = useRecord(items, params.id);
  const { records: allAdjustments } = useRecords(adjustments);

  if (!item) {
    return (
      <Screen>
        <EmptyState title="Item not found" />
      </Screen>
    );
  }

  const history = allAdjustments
    .filter((a) => a.itemId === item.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Screen testID="item-detail-screen">
      <Card>
        <Text style={[t.type.heading, { color: t.color.text }]}>{item.name}</Text>
        <Text style={[t.type.small, { color: t.color.textMuted }]}>
          {item.sku} · {item.location}
        </Text>
        <Text
          style={[t.type.title, { color: isLowStock(item) ? t.color.danger : t.color.text }]}
          testID="item-quantity"
        >
          {item.quantity} in stock{isLowStock(item) ? " (low)" : ""}
        </Text>
      </Card>
      <Button
        label="Adjust stock"
        onPress={() => navigation.navigate("AdjustStock", { id: item.id })}
        testID="item-adjust"
      />
      <Text style={[t.type.label, { color: t.color.text }]}>History</Text>
      <View>
        {history.map((a) => (
          <ListRow
            key={a.id}
            title={`${a.delta > 0 ? "+" : "−"}${Math.abs(a.delta)} · ${a.reason}`}
            subtitle={new Date(a.createdAt).toLocaleString()}
            detail={`→ ${a.quantityAfter}`}
            testID={`adjustment-${a.id}`}
          />
        ))}
      </View>
    </Screen>
  );
}
