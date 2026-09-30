import { render, screen } from "@testing-library/react-native";
import App from "../App";

describe("App", () => {
  it("opens the store and renders the bare foundation's Home tab", async () => {
    render(<App />);
    expect(await screen.findByTestId("home-screen")).toBeOnTheScreen();
    expect(screen.getByText("Your app starts here")).toBeOnTheScreen();
    expect(screen.getByText("About")).toBeOnTheScreen();
  });
});
