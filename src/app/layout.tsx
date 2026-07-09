import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

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
    <html lang="en" className={plusJakartaSans.variable}>
      <body className="bg-gray-50 text-gray-900 antialiased font-sans">{children}</body>
    </html>
  );
}
