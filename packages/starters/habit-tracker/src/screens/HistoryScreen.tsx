import { View } from "react-native";
import { EmptyState, ListRow, Screen } from "../components";
import { useRecords } from "../data/store";
import { checkIns, habits } from "../data/models";

export function HistoryScreen() {
  const { records: allCheckIns, loading } = useRecords(checkIns);
  const { records: allHabits } = useRecords(habits);
  const nameOf = (id: string) => allHabits.find((h) => h.id === id)?.name ?? "Deleted habit";
  const sorted = [...allCheckIns].sort(
    (a, b) => b.date.localeCompare(a.date) || nameOf(a.habitId).localeCompare(nameOf(b.habitId)),
  );

  return (
    <Screen testID="history-screen">
      {!loading && sorted.length === 0 ? <EmptyState title="No check-ins yet" /> : null}
      <View>
        {sorted.map((c) => (
          <ListRow
            key={c.id}
            title={nameOf(c.habitId)}
            subtitle={c.date}
            testID={`history-${c.date}-${nameOf(c.habitId)}`}
          />
        ))}
      </View>
    </Screen>
  );
}
