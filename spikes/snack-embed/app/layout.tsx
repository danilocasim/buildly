export const metadata = { title: "S1 Snack embed spike" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 16 }}>{children}</body>
    </html>
  );
}
