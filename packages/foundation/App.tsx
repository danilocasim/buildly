// Foundation entry point (read-only). The project supplies src/navigation.tsx,
// src/data/models.ts (schemaVersion), and src/data/seed.ts (seed).
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  ErrorBoundary,
  installGlobalErrorHandler,
  reportRuntimeError,
  ReseedNotice,
} from "./src/components";
import { usePreviewBridge } from "./src/components/PreviewBridge";
import { openStore, reset, type OpenStoreResult } from "./src/data/store";
import { schemaVersion } from "./src/data/models";
import { seed } from "./src/data/seed";
import { RootNavigator } from "./src/navigation";
import { ThemeProvider, tokens } from "./src/theme";

installGlobalErrorHandler();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: tokens.color.accent,
    background: tokens.color.background,
    card: tokens.color.surface,
    text: tokens.color.text,
    border: tokens.color.border,
  },
};

export default function App() {
  const [store, setStore] = useState<OpenStoreResult | null>(null);
  // Bumped after a demo-data reset so every screen remounts on the fresh data.
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    openStore({ schemaVersion, seed }).then(setStore, (error: unknown) => {
      reportRuntimeError(error, false);
      setStore({ didReseed: false });
    });
  }, []);

  usePreviewBridge(
    useCallback(() => {
      reset().then(
        () => setEpoch((n) => n + 1),
        (error: unknown) => reportRuntimeError(error, false),
      );
    }, []),
  );

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ErrorBoundary>
          {store ? (
            <View style={{ flex: 1 }}>
              <NavigationContainer key={epoch} theme={navigationTheme}>
                <RootNavigator />
              </NavigationContainer>
              <ReseedNotice visible={store.didReseed} />
            </View>
          ) : (
            <View
              testID="app-loading"
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: tokens.color.background,
              }}
            >
              <ActivityIndicator color={tokens.color.accent} />
            </View>
          )}
        </ErrorBoundary>
        <StatusBar style="dark" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
