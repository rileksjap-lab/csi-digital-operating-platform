import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CSI Digital Operating Platform",
  description:
    "Internal operating platform for the Consultant, Solution & Innovation department — 10 Creative Solutions Sdn Bhd",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
