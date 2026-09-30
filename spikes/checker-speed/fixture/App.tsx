import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "./src/theme";
import { Navigation } from "./src/navigation";

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Navigation />
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
