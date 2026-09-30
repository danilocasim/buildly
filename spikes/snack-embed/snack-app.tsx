// Imports every allowlisted dependency so a Snack bundle exercises all of them.
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { enableScreens } from "react-native-screens";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";

enableScreens();

const Tabs = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Home() {
  const [opens, setOpens] = useState<number | null>(null);
  useEffect(() => {
    AsyncStorage.getItem("opens").then((value) => {
      const next = Number(value ?? 0) + 1;
      setOpens(next);
      return AsyncStorage.setItem("opens", String(next));
    });
  }, []);
  return (
    <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
      <Text testID="s2-status">S2 dependencies loaded</Text>
      <Text>App opened {opens ?? "…"} times (AsyncStorage)</Text>
    </SafeAreaView>
  );
}

function Settings() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Settings tab</Text>
    </View>
  );
}

function TabsScreen() {
  return (
    <Tabs.Navigator>
      <Tabs.Screen name="Home" component={Home} />
      <Tabs.Screen name="Settings" component={Settings} />
    </Tabs.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Root" component={TabsScreen} options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
