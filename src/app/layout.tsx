import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavTabs from "@/components/NavTabs";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ruca Edén — Finanzas",
  description: "Reemplazo de la planilla Informacion General - Gastos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-neutral-900">
        <header className="flex items-center justify-between bg-green-800 px-4 py-2 text-white">
          <h1 className="text-base font-semibold">Ruca Edén — Finanzas</h1>
        </header>
        <NavTabs />
        <main className="flex-1 p-4">{children}</main>
      </body>
    </html>
  );
}
