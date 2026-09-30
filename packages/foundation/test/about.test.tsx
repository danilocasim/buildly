const cleanups: (() => void)[] = [];

// app.json → expo.extra.showAttribution, as expo-constants exposes it at runtime.
function renderAbout(extra: Record<string, unknown>) {
  jest.resetModules();
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: { expoConfig: { name: "Journal", extra } },
  }));
  const { AboutScreen } =
    require("../src/components/AboutScreen") as typeof import("../src/components/AboutScreen");
  // Required after resetModules so the renderer and the screen share one React instance.
  const rntl =
    require("@testing-library/react-native/pure") as typeof import("@testing-library/react-native/pure");
  cleanups.push(rntl.cleanup);
  return rntl.render(<AboutScreen />);
}

describe("AboutScreen", () => {
  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    jest.dontMock("expo-constants");
  });

  it("shows the attribution when showAttribution is true", () => {
    const screen = renderAbout({ showAttribution: true });
    expect(screen.getByTestId("about-attribution")).toHaveTextContent("Made with Buildly");
    expect(screen.getByText("Journal")).toBeTruthy();
  });

  it("shows the attribution by default", () => {
    const screen = renderAbout({});
    expect(screen.getByTestId("about-attribution")).toBeTruthy();
  });

  it("hides the attribution when showAttribution is false", () => {
    const screen = renderAbout({ showAttribution: false });
    expect(screen.queryByTestId("about-attribution")).toBeNull();
    expect(screen.queryByText("Made with Buildly")).toBeNull();
  });

  it("defaults to true in app.json", () => {
    expect(require("../app.json").expo.extra.showAttribution).toBe(true);
  });
});
