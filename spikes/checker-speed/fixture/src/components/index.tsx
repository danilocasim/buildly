import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, TextInput, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";

export function Screen({ children, scroll = true, testID }: { children: ReactNode; scroll?: boolean; testID?: string }) {
  const t = useTheme();
  const body = scroll ? <ScrollView contentContainerStyle={{ padding: t.space.lg }}>{children}</ScrollView> : children;
  return (
    <SafeAreaView testID={testID} style={{ flex: 1, backgroundColor: t.color.bg }}>
      {body}
    </SafeAreaView>
  );
}

export function Card({ children, style, testID }: { children: ReactNode; style?: ViewStyle; testID?: string }) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      style={[{ backgroundColor: t.color.surface, borderRadius: t.radius.card, padding: t.space.lg, borderWidth: 1, borderColor: t.color.line }, style]}
    >
      {children}
    </View>
  );
}

export function ListRow(props: { title: string; subtitle?: string; onPress?: () => void; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable testID={props.testID} onPress={props.onPress} style={{ paddingVertical: t.space.md, borderBottomWidth: 1, borderColor: t.color.line }}>
      <Text style={{ fontSize: t.type.body, color: t.color.text }}>{props.title}</Text>
      {props.subtitle ? <Text style={{ fontSize: t.type.small, color: t.color.muted }}>{props.subtitle}</Text> : null}
    </Pressable>
  );
}

export function Button(props: { label: string; onPress: () => void; disabled?: boolean; variant?: "primary" | "danger"; testID?: string }) {
  const t = useTheme();
  const bg = props.variant === "danger" ? t.color.danger : t.color.accent;
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={{ backgroundColor: bg, opacity: props.disabled ? 0.5 : 1, padding: t.space.md, borderRadius: t.radius.card, alignItems: "center" }}
    >
      <Text style={{ color: "#fff", fontWeight: "600" }}>{props.label}</Text>
    </Pressable>
  );
}

export function TextField(props: { label: string; value: string; onChangeText: (text: string) => void; multiline?: boolean; testID?: string }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: t.space.lg }}>
      <Text style={{ color: t.color.muted, marginBottom: t.space.xs }}>{props.label}</Text>
      <TextInput
        testID={props.testID}
        value={props.value}
        onChangeText={props.onChangeText}
        multiline={props.multiline}
        style={{ borderWidth: 1, borderColor: t.color.line, borderRadius: t.radius.card, padding: t.space.md, minHeight: props.multiline ? 120 : undefined }}
      />
    </View>
  );
}

export function EmptyState({ title, body, testID }: { title: string; body?: string; testID?: string }) {
  const t = useTheme();
  return (
    <View testID={testID} style={{ alignItems: "center", padding: t.space.xl }}>
      <Text style={{ fontSize: t.type.title, color: t.color.text }}>{title}</Text>
      {body ? <Text style={{ color: t.color.muted, textAlign: "center" }}>{body}</Text> : null}
    </View>
  );
}

export function FAB({ onPress, testID }: { onPress: () => void; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{ position: "absolute", right: t.space.xl, bottom: t.space.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: t.color.accent, alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name="add" size={28} color="#fff" />
    </Pressable>
  );
}
