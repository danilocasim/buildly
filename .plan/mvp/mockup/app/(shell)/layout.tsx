import { Sidebar } from "@/components/Sidebar";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    // Locked to the viewport: the sidebar stays put and only the main area scrolls.
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="scroll-thin h-full min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
