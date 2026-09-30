import "@testing-library/react-native/build/matchers/extend-expect";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
jest.mock("@expo/vector-icons", () => {
  const Icon = () => null;
  return { Ionicons: Object.assign(Icon, { glyphMap: {} }) };
});
