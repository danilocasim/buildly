import { fireEvent, render, screen } from "@testing-library/react-native";
import App from "../../foundation/App";
import { addDays, dateKey, streak } from "../habit-tracker/src/data/models";

describe("habit tracker starter", () => {
  it("checks in today, increments the streak, and lists the check-in in History", async () => {
    render(<App />);
    // Seeded with check-ins yesterday and the day before.
    expect(await screen.findByTestId("streak-Read 10 pages")).toHaveTextContent("Streak: 2 days");
    expect(screen.getByTestId("streak-Drink water")).toHaveTextContent("Streak: 4 days");

    fireEvent.press(screen.getByTestId("checkin-Read 10 pages"));
    expect(await screen.findByText("Streak: 3 days")).toBeOnTheScreen();
    expect(screen.getByTestId("checkin-Read 10 pages")).toBeDisabled();

    fireEvent.press(screen.getByLabelText(/^History, tab/));
    expect(await screen.findByTestId(`history-${dateKey()}-Read 10 pages`)).toBeOnTheScreen();
  });

  it("adds a habit and opens its detail", async () => {
    render(<App />);
    fireEvent.press(await screen.findByLabelText(/^Habits, tab/));
    fireEvent.changeText(await screen.findByTestId("habits-name"), "Meditate");
    fireEvent.press(screen.getByTestId("habits-add"));
    fireEvent.press(await screen.findByTestId("habit-row-Meditate"));
    expect(await screen.findByTestId("habit-detail-streak")).toHaveTextContent(
      "Current streak: 0 · Total check-ins: 0",
    );
  });
});

describe("streak", () => {
  const today = "2026-03-10";

  it("counts consecutive days ending today", () => {
    expect(streak(["2026-03-08", "2026-03-09", "2026-03-10"], today)).toBe(3);
  });

  it("keeps yesterday's streak alive before today's check-in", () => {
    expect(streak(["2026-03-08", "2026-03-09"], today)).toBe(2);
  });

  it("resets across a gap day", () => {
    expect(streak(["2026-03-06", "2026-03-07", "2026-03-09", "2026-03-10"], today)).toBe(2);
    expect(streak(["2026-03-07", "2026-03-08"], today)).toBe(0);
  });

  it("ignores duplicates and handles month and DST boundaries", () => {
    expect(streak(["2026-02-28", "2026-03-01", "2026-03-01"], "2026-03-01")).toBe(2);
    // US and EU daylight-saving changes happen in late March.
    expect(streak(["2026-03-28", "2026-03-29", "2026-03-30"], "2026-03-30")).toBe(3);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("formats local days", () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
