import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AboutScreen } from "./components";
import { EntriesScreen } from "./screens/EntriesScreen";
import { EntryDetailScreen } from "./screens/EntryDetailScreen";
import { NewEntryScreen } from "./screens/NewEntryScreen";
import { TagsScreen } from "./screens/TagsScreen";

export type TabParamList = {
  Entries: undefined;
  Tags: undefined;
  About: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  EntryDetail: { id: string };
  NewEntry: undefined;
};

const Tabs = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function TabsNavigator() {
  return (
    <Tabs.Navigator>
      <Tabs.Screen
        name="Entries"
        component={EntriesScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Tags"
        component={TagsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pricetags-outline" color={color} size={size} />
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
      <Stack.Screen name="EntryDetail" component={EntryDetailScreen} options={{ title: "Entry" }} />
      <Stack.Screen
        name="NewEntry"
        component={NewEntryScreen}
        options={{ title: "New entry", presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}
