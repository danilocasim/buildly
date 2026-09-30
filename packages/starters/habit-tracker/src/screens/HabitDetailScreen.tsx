import { Text, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, Card, EmptyState, Screen } from "../components";
import { useRecord, useRecords } from "../data/store";
import { addDays, checkIns, dateKey, habits, removeHabit, streak } from "../data/models";
import type { RootStackParamList } from "../navigation";
import { useTheme } from "../theme";

export function HabitDetailScreen() {
  const t = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, "HabitDetail">>();
  const habit = useRecord(habits, params.id);
  const { records: allCheckIns } = useRecords(checkIns);

  if (!habit) {
    return (
      <Screen>
        <EmptyState title="Habit not found" />
      </Screen>
    );
  }

  const today = dateKey();
  const dates = allCheckIns.filter((c) => c.habitId === habit.id).map((c) => c.date);
  const lastWeek = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  return (
    <Screen testID="habit-detail-screen">
      <Card>
        <Text style={[t.type.heading, { color: t.color.text }]}>{habit.name}</Text>
        {habit.description ? (
          <Text style={[t.type.body, { color: t.color.textMuted }]}>{habit.description}</Text>
        ) : null}
        <Text style={[t.type.label, { color: t.color.text }]} testID="habit-detail-streak">
          Current streak: {streak(dates, today)} · Total check-ins: {dates.length}
        </Text>
        <View style={{ flexDirection: "row", gap: t.space.xs }}>
          {lastWeek.map((day) => (
            <View
              key={day}
              accessibilityLabel={`${day} ${dates.includes(day) ? "checked in" : "missed"}`}
              style={{
                flex: 1,
                height: 28,
                borderRadius: t.radius.sm,
                backgroundColor: dates.includes(day) ? t.color.success : t.color.border,
              }}
            />
          ))}
        </View>
      </Card>
      <Button
        label="Delete habit"
        variant="danger"
        onPress={async () => {
          await removeHabit(habit.id);
          navigation.goBack();
        }}
        testID="habit-delete"
      />
    </Screen>
  );
}
