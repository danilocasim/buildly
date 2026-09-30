import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AboutScreen } from "./components";
import { HabitDetailScreen } from "./screens/HabitDetailScreen";
import { HabitsScreen } from "./screens/HabitsScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { TodayScreen } from "./screens/TodayScreen";

export type TabParamList = {
  Today: undefined;
  Habits: undefined;
  History: undefined;
  About: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  HabitDetail: { id: string };
};

const Tabs = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function TabsNavigator() {
  return (
    <Tabs.Navigator>
      <Tabs.Screen
        name="Today"
        component={TodayScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="today-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Habits"
        component={HabitsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="About"
        component={AboutScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="information-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="HabitDetail" component={HabitDetailScreen} options={{ title: "Habit" }} />
    </Stack.Navigator>
  );
}
