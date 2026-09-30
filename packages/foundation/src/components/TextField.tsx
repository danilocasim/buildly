import { Text, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { useTheme } from "../theme";

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  disabled?: boolean;
  testID?: string;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  disabled,
  testID,
}: TextFieldProps) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.xs }}>
      <Text style={[t.type.small, { color: t.color.textMuted }]}>{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.color.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        editable={!disabled}
        style={[
          t.type.body,
          {
            color: t.color.text,
            backgroundColor: t.color.surface,
            borderWidth: 1,
            borderColor: t.color.border,
            borderRadius: t.radius.md,
            paddingHorizontal: t.space.md,
            paddingVertical: t.space.sm,
            minHeight: multiline ? 120 : 48,
            textAlignVertical: multiline ? "top" : "center",
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      />
    </View>
  );
}
