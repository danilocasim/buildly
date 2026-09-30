import { fireEvent, render, screen } from "@testing-library/react-native";
import App from "../../foundation/App";
import { adjustments, items } from "../inventory/src/data/models";

describe("inventory starter", () => {
  it("adjusts stock by −2, lowering the quantity and recording an Adjustment", async () => {
    render(<App />);
    fireEvent.press(await screen.findByTestId("item-row-CAB-USBC-1M"));
    expect(await screen.findByTestId("item-quantity")).toHaveTextContent("24 in stock");

    fireEvent.press(screen.getByTestId("item-adjust"));
    fireEvent.press(await screen.findByTestId("adjust-minus"));
    fireEvent.press(screen.getByTestId("adjust-minus"));
    expect(screen.getByTestId("adjust-delta")).toHaveTextContent("-2");
    fireEvent.changeText(screen.getByTestId("adjust-reason"), "Damaged");
    fireEvent.press(screen.getByTestId("adjust-save"));

    expect(await screen.findByText("22 in stock")).toBeOnTheScreen();
    expect(screen.getByText("−2 · Damaged")).toBeOnTheScreen();

    const item = (await items.list()).find((i) => i.sku === "CAB-USBC-1M")!;
    expect(item.quantity).toBe(22);
    const recorded = (await adjustments.list()).filter(
      (a) => a.itemId === item.id && a.delta === -2,
    );
    expect(recorded).toEqual([expect.objectContaining({ reason: "Damaged", quantityAfter: 22 })]);
  });

  it("refuses to take stock below zero", async () => {
    render(<App />);
    fireEvent.press(await screen.findByTestId("item-row-ADP-HDMI"));
    fireEvent.press(await screen.findByTestId("item-adjust"));
    for (let i = 0; i < 4; i++) fireEvent.press(await screen.findByTestId("adjust-minus"));
    fireEvent.press(screen.getByTestId("adjust-save"));
    expect(await screen.findByTestId("adjust-error")).toHaveTextContent("Only 3 in stock");
  });

  it("finds items by name on the Search tab", async () => {
    render(<App />);
    fireEvent.press(await screen.findByLabelText(/^Search, tab/));
    fireEvent.changeText(await screen.findByTestId("search-query"), "hdmi");
    expect(await screen.findByTestId("search-result-ADP-HDMI")).toBeOnTheScreen();
    expect(screen.queryByTestId("search-result-CAB-USBC-1M")).toBeNull();
  });
});
