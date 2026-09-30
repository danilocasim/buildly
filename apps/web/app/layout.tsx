import type { ReactNode } from "react";

export const metadata = { title: "Buildly" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          background: "#FAF9F7",
          color: "#171717",
        }}
      >
        {children}
      </body>
    </html>
  );
}
