import { useState } from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, EmptyState, ListRow, Screen, TextField } from "../components";
import { useRecords } from "../data/store";
import { habits } from "../data/models";
import type { RootStackParamList } from "../navigation";

export function HabitsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { records, loading } = useRecords(habits);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const addHabit = async () => {
    await habits.create({ name: name.trim(), description: description.trim() });
    setName("");
    setDescription("");
  };

  return (
    <Screen testID="habits-screen">
      <TextField
        label="New habit"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Meditate"
        testID="habits-name"
      />
      <TextField
        label="Why or when"
        value={description}
        onChangeText={setDescription}
        testID="habits-description"
      />
      <Button label="Add habit" disabled={!name.trim()} onPress={addHabit} testID="habits-add" />
      {!loading && records.length === 0 ? <EmptyState title="No habits yet" /> : null}
      <View>
        {records.map((habit) => (
          <ListRow
            key={habit.id}
            title={habit.name}
            subtitle={habit.description}
            onPress={() => navigation.navigate("HabitDetail", { id: habit.id })}
            testID={`habit-row-${habit.name}`}
          />
        ))}
      </View>
    </Screen>
  );
}
