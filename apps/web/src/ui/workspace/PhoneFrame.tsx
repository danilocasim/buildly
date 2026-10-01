export type Viewport = "small" | "large";

export const VIEWPORTS: Record<Viewport, { label: string; width: number; height: number }> = {
  small: { label: "Small phone", width: 300, height: 600 },
  large: { label: "Large phone", width: 330, height: 680 },
};

/** A phone-shaped frame around the preview; the player fills it (ARCHITECTURE.md §6). */
export function PhoneFrame({
  viewport,
  children,
}: {
  viewport: Viewport;
  children: React.ReactNode;
}) {
  const { width, height } = VIEWPORTS[viewport];
  return (
    <div
      data-testid="phone-frame"
      data-viewport={viewport}
      className="relative rounded-[46px] bg-ink p-[10px] shadow-[0_24px_60px_rgb(23_23_23/0.28)] transition-[width,height] duration-300"
      style={{ width: width + 20, height: height + 20 }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[38px] bg-white">
        {children}
      </div>
      <span
        aria-hidden="true"
        className="absolute bottom-3 left-1/2 z-20 h-1 w-28 -translate-x-1/2 rounded-full bg-ink/60"
      />
    </div>
  );
}
