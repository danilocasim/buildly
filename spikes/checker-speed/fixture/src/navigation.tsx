import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { EntriesScreen } from "./screens/EntriesScreen";
import { EntryDetailScreen } from "./screens/EntryDetailScreen";
import { NewEntryScreen } from "./screens/NewEntryScreen";
import { TagsScreen } from "./screens/TagsScreen";

export type RootStackParamList = {
  Tabs: undefined;
  EntryDetail: { id: string };
  NewEntry: undefined;
};

export type TabParamList = {
  Entries: undefined;
  Tags: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

function TabsNavigator() {
  return (
    <Tabs.Navigator>
      <Tabs.Screen
        name="Entries"
        component={EntriesScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="book" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="Tags"
        component={TagsScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="pricetags" color={color} size={size} /> }}
      />
    </Tabs.Navigator>
  );
}

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
        <Stack.Screen name="EntryDetail" component={EntryDetailScreen} options={{ title: "Entry" }} />
        <Stack.Screen name="NewEntry" component={NewEntryScreen} options={{ title: "New entry", presentation: "modal" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
