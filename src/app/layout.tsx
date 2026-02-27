import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CutLink — сервіс скорочення посилань",
  description:
    "CutLink дозволяє миттєво створювати короткі посилання, відстежувати кліки та керувати терміном дії.",
  openGraph: {
    title: "CutLink — сервіс скорочення посилань",
    description:
      "Генеруйте короткі посилання з підрахунком кліків, кастомним кодом і терміном дії в один клік.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
