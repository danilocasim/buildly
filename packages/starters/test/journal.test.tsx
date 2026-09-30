import { fireEvent, render, screen, within } from "@testing-library/react-native";
// The real foundation App; the resolver swaps in this starter's navigation, models, and seed.
import App from "../../foundation/App";

describe("journal starter", () => {
  it("navigates tabs, creates an entry that the list shows, and filters by search", async () => {
    render(<App />);
    expect(await screen.findByText("Sprint review")).toBeOnTheScreen();
    expect(screen.getByTestId("demo-data-pill")).toBeOnTheScreen();

    // Tabs navigate.
    fireEvent.press(screen.getByLabelText(/^Tags, tab/));
    expect(await screen.findByTestId("tags-screen")).toBeOnTheScreen();
    expect(within(screen.getByTestId("tag-row-Life")).getByText("3 entries")).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText(/^Entries, tab/));
    expect(await screen.findByTestId("entries-screen")).toBeOnTheScreen();

    // Create an entry.
    fireEvent.press(screen.getByTestId("entries-new"));
    fireEvent.changeText(await screen.findByTestId("new-entry-title"), "Trail run");
    fireEvent.changeText(screen.getByTestId("new-entry-body"), "Ten kilometres in the hills.");
    fireEvent.press(screen.getByTestId("tag-Life"));
    fireEvent.press(screen.getByTestId("new-entry-save"));
    expect(await screen.findByText("Trail run")).toBeOnTheScreen();

    // Search filters.
    fireEvent.changeText(screen.getByTestId("entries-search"), "RAINY");
    expect(await screen.findByText("Rainy Sunday")).toBeOnTheScreen();
    expect(screen.queryByText("Trail run")).toBeNull();
    expect(screen.queryByText("Sprint review")).toBeNull();
  });

  it("opens an entry and deletes it", async () => {
    render(<App />);
    fireEvent.press(await screen.findByText("Sprint review"));
    expect(await screen.findByTestId("entry-detail-screen")).toBeOnTheScreen();
    expect(screen.getByText(/Mood: good · Work/)).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("entry-delete"));
    expect(await screen.findByTestId("entries-screen")).toBeOnTheScreen();
    expect(screen.queryByText("Sprint review")).toBeNull();
  });
});
