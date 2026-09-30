import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Button, Card, EmptyState, FAB, ListRow, Screen, TextField } from "../src/components";

describe("Screen", () => {
  it("renders children in scrolling and fixed layouts", () => {
    render(
      <Screen testID="scroll">
        <Text>inside</Text>
      </Screen>,
    );
    expect(screen.getByTestId("scroll")).toBeOnTheScreen();
    expect(screen.getByText("inside")).toBeOnTheScreen();

    render(
      <Screen scroll={false} testID="fixed">
        <Text>fixed</Text>
      </Screen>,
    );
    expect(screen.getByTestId("fixed")).toBeOnTheScreen();
  });
});

describe("Card", () => {
  it("renders, fires onPress, and respects disabled", () => {
    const onPress = jest.fn();
    const { rerender } = render(
      <Card testID="card" onPress={onPress}>
        <Text>body</Text>
      </Card>,
    );
    fireEvent.press(screen.getByTestId("card"));
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(
      <Card testID="card" onPress={onPress} disabled>
        <Text>body</Text>
      </Card>,
    );
    fireEvent.press(screen.getByTestId("card"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("ListRow", () => {
  it("renders title, subtitle, and detail, fires onPress, and respects disabled", () => {
    const onPress = jest.fn();
    const { rerender } = render(
      <ListRow testID="row" title="Milk" subtitle="Dairy" detail="3" onPress={onPress} />,
    );
    expect(screen.getByText("Milk")).toBeOnTheScreen();
    expect(screen.getByText("Dairy")).toBeOnTheScreen();
    expect(screen.getByText("3")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("row"));
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(<ListRow testID="row" title="Milk" onPress={onPress} disabled />);
    fireEvent.press(screen.getByTestId("row"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("Button", () => {
  it.each(["primary", "secondary", "danger"] as const)(
    "%s renders, fires onPress, and respects disabled",
    (variant) => {
      const onPress = jest.fn();
      const { rerender } = render(
        <Button testID="btn" label="Save" variant={variant} onPress={onPress} />,
      );
      expect(screen.getByText("Save")).toBeOnTheScreen();
      fireEvent.press(screen.getByTestId("btn"));
      expect(onPress).toHaveBeenCalledTimes(1);

      rerender(<Button testID="btn" label="Save" variant={variant} onPress={onPress} disabled />);
      expect(screen.getByTestId("btn")).toBeDisabled();
      fireEvent.press(screen.getByTestId("btn"));
      expect(onPress).toHaveBeenCalledTimes(1);
    },
  );
});

describe("Button with an async onPress", () => {
  it("stays disabled until the promise settles, so a double tap runs once", async () => {
    let finish!: () => void;
    const onPress = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<Button testID="save" label="Save" onPress={onPress} />);
    fireEvent.press(screen.getByTestId("save"));
    fireEvent.press(screen.getByTestId("save"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("save")).toBeDisabled();
    await act(() => {
      finish();
      return Promise.resolve();
    });
    expect(screen.getByTestId("save")).toBeEnabled();
  });

  it("logs a rejected promise as a runtime error and re-enables", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Button testID="save" label="Save" onPress={() => Promise.reject(new Error("disk full"))} />,
    );
    await act(() => {
      fireEvent.press(screen.getByTestId("save"));
      return Promise.resolve();
    });
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('"message":"disk full"'));
    expect(screen.getByTestId("save")).toBeEnabled();
    consoleError.mockRestore();
  });
});

describe("TextField", () => {
  it("renders its label, fires onChangeText, and respects disabled", () => {
    const onChangeText = jest.fn();
    const { rerender } = render(
      <TextField testID="field" label="Title" value="" onChangeText={onChangeText} />,
    );
    expect(screen.getByText("Title")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId("field"), "Hello");
    expect(onChangeText).toHaveBeenCalledWith("Hello");

    rerender(
      <TextField testID="field" label="Title" value="" onChangeText={onChangeText} disabled />,
    );
    expect(screen.getByTestId("field")).toHaveProp("editable", false);
    fireEvent.changeText(screen.getByTestId("field"), "Ignored");
    expect(onChangeText).toHaveBeenCalledTimes(1);
  });
});

describe("EmptyState", () => {
  it("renders text and fires its action", () => {
    const onAction = jest.fn();
    render(
      <EmptyState
        testID="empty"
        title="No entries"
        body="Add one"
        actionLabel="New entry"
        onAction={onAction}
      />,
    );
    expect(screen.getByText("No entries")).toBeOnTheScreen();
    expect(screen.getByText("Add one")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("empty-action"));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe("FAB", () => {
  it("renders with an accessible label, fires onPress, and respects disabled", () => {
    const onPress = jest.fn();
    const { rerender } = render(
      <FAB testID="fab" onPress={onPress} accessibilityLabel="New entry" />,
    );
    expect(screen.getByLabelText("New entry")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("fab"));
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(<FAB testID="fab" onPress={onPress} disabled />);
    fireEvent.press(screen.getByTestId("fab"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
