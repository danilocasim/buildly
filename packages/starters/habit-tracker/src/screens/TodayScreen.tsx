import { Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, Card, DemoDataPill, EmptyState, Screen } from "../components";
import { useRecords } from "../data/store";
import { checkIn, checkIns, dateKey, habits, streak } from "../data/models";
import type { RootStackParamList } from "../navigation";
import { useTheme } from "../theme";

export function TodayScreen() {
  const t = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { records: allHabits, loading } = useRecords(habits);
  const { records: allCheckIns } = useRecords(checkIns);
  const today = dateKey();

  return (
    <Screen testID="today-screen">
      <DemoDataPill />
      <Text style={[t.type.title, { color: t.color.text }]}>{new Date().toDateString()}</Text>
      {!loading && allHabits.length === 0 ? (
        <EmptyState title="No habits yet" body="Add one on the Habits tab." />
      ) : null}
      {allHabits.map((habit) => {
        const dates = allCheckIns.filter((c) => c.habitId === habit.id).map((c) => c.date);
        const days = streak(dates, today);
        const doneToday = dates.includes(today);
        return (
          <Card
            key={habit.id}
            onPress={() => navigation.navigate("HabitDetail", { id: habit.id })}
            testID={`habit-card-${habit.name}`}
          >
            <Text style={[t.type.label, { color: t.color.text }]}>{habit.name}</Text>
            <Text
              style={[t.type.small, { color: t.color.textMuted }]}
              testID={`streak-${habit.name}`}
            >
              Streak: {days} {days === 1 ? "day" : "days"}
            </Text>
            <View style={{ alignSelf: "flex-start" }}>
              <Button
                label={doneToday ? "Done today" : "Check in"}
                variant={doneToday ? "secondary" : "primary"}
                disabled={doneToday}
                onPress={() => void checkIn(habit.id, today)}
                testID={`checkin-${habit.name}`}
              />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
