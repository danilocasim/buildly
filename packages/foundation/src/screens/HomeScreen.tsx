import { DemoDataPill, EmptyState, Screen } from "../components";

export function HomeScreen() {
  return (
    <Screen testID="home-screen">
      <DemoDataPill />
      <EmptyState
        title="Your app starts here"
        body="Describe what it should do and Buildly will build it."
      />
    </Screen>
  );
}
