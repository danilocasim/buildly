import "@testing-library/react-native/build/matchers/extend-expect";

// CI runners are several times slower than a laptop; the first render of a whole app
// (module load, store open, seed) can exceed RNTL's 1 s default.
import { configure } from "@testing-library/react-native";
configure({ asyncUtilTimeout: 10_000 });

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
