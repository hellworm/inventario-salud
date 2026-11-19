import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RedInsumos", template: "%s · RedInsumos" },
  description: "Inventario en red de insumos médicos para centros de salud.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1a7480",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // La CSP usa un nonce por solicitud (src/proxy.ts): ninguna página se puede
  // prerenderizar, porque sus scripts quedarían sin nonce y el navegador los bloquearía.
  await connection();
  return (
    <html lang="es-CL" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
