import { useState } from "react";
import { Text, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, EmptyState, Screen, TextField } from "../components";
import { useRecord } from "../data/store";
import { adjustStock, items } from "../data/models";
import type { RootStackParamList } from "../navigation";
import { useTheme } from "../theme";

export function AdjustStockScreen() {
  const t = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, "AdjustStock">>();
  const item = useRecord(items, params.id);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!item) {
    return (
      <Screen>
        <EmptyState title="Item not found" />
      </Screen>
    );
  }

  const save = async () => {
    try {
      await adjustStock(item.id, delta, reason);
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen testID="adjust-stock-screen">
      <Text style={[t.type.title, { color: t.color.text }]}>{item.name}</Text>
      <Text style={[t.type.body, { color: t.color.textMuted }]}>
        {item.quantity} in stock → {item.quantity + delta}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.md }}>
        <Button
          label="−1"
          variant="secondary"
          onPress={() => setDelta((d) => d - 1)}
          testID="adjust-minus"
        />
        <Text
          style={[t.type.heading, { color: t.color.text, minWidth: 56, textAlign: "center" }]}
          testID="adjust-delta"
        >
          {delta > 0 ? `+${delta}` : String(delta)}
        </Text>
        <Button
          label="+1"
          variant="secondary"
          onPress={() => setDelta((d) => d + 1)}
          testID="adjust-plus"
        />
      </View>
      <TextField
        label="Reason"
        value={reason}
        onChangeText={setReason}
        placeholder="e.g. Sold, damaged, restock"
        testID="adjust-reason"
      />
      {error ? (
        <Text style={[t.type.small, { color: t.color.danger }]} testID="adjust-error">
          {error}
        </Text>
      ) : null}
      <Button label="Save adjustment" disabled={delta === 0} onPress={save} testID="adjust-save" />
    </Screen>
  );
}
