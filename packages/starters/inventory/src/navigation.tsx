import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AboutScreen } from "./components";
import { AdjustStockScreen } from "./screens/AdjustStockScreen";
import { ItemDetailScreen } from "./screens/ItemDetailScreen";
import { ItemsScreen } from "./screens/ItemsScreen";
import { SearchScreen } from "./screens/SearchScreen";

export type TabParamList = {
  Items: undefined;
  Search: undefined;
  About: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  ItemDetail: { id: string };
  AdjustStock: { id: string };
};

const Tabs = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function TabsNavigator() {
  return (
    <Tabs.Navigator>
      <Tabs.Screen
        name="Items"
        component={ItemsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Search"
        component={SearchScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" color={color} size={size} />
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
      <Stack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: "Item" }} />
      <Stack.Screen
        name="AdjustStock"
        component={AdjustStockScreen}
        options={{ title: "Adjust stock", presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}
