import { Wifi, Battery, Signal } from "lucide-react";

export type Viewport = "small" | "large";

const sizes: Record<Viewport, { w: number; h: number }> = {
  small: { w: 300, h: 600 },
  large: { w: 330, h: 680 },
};

export function PhoneFrame({ viewport, children }: { viewport: Viewport; children: React.ReactNode }) {
  const { w, h } = sizes[viewport];
  return (
    <div
      className="relative rounded-[46px] bg-ink p-[10px] shadow-[0_24px_60px_rgb(23_23_23/0.28)] transition-[width,height] duration-300"
      style={{ width: w + 20, height: h + 20 }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[38px] bg-white">
        {/* status bar and dynamic island */}
        <div className="absolute inset-x-0 top-0 z-20 flex h-11 items-center justify-between px-6 text-[12px] font-semibold text-ink">
          <span>9:41</span>
          <span className="absolute top-2.5 left-1/2 h-[26px] w-[92px] -translate-x-1/2 rounded-full bg-ink" />
          <span className="flex items-center gap-1">
            <Signal size={13} /> <Wifi size={13} /> <Battery size={15} />
          </span>
        </div>
        <div className="h-full w-full overflow-hidden pt-11">{children}</div>
        <span className="absolute bottom-1.5 left-1/2 z-20 h-1 w-28 -translate-x-1/2 rounded-full bg-ink/80" />
      </div>
    </div>
  );
}
