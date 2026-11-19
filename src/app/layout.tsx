import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ProveedorTema } from "@/components/shell/tema";
import { Toaster } from "@/components/ui/toast";
import { COLOR_BARRA, COOKIE_TEMA, atributoTema, leerTema } from "@/lib/tema";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RedInsumos", template: "%s · RedInsumos" },
  description: "Inventario en red de insumos médicos para centros de salud.",
  robots: { index: false, follow: false },
  applicationName: "RedInsumos",
  manifest: "/manifest.webmanifest",
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  appleWebApp: { capable: true, title: "RedInsumos", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

/** Tema elegido (cookie `ri_tema`); sin cookie, "sistema": decide el dispositivo. */
async function temaDeLaSolicitud() {
  return leerTema((await cookies()).get(COOKIE_TEMA)?.value);
}

/** `theme-color` acorde al tema: uno fijo si está forzado; si no, uno por `prefers-color-scheme`. */
export async function generateViewport(): Promise<Viewport> {
  const forzado = atributoTema(await temaDeLaSolicitud());
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: forzado
      ? COLOR_BARRA[forzado]
      : [
          { media: "(prefers-color-scheme: light)", color: COLOR_BARRA.claro },
          { media: "(prefers-color-scheme: dark)", color: COLOR_BARRA.oscuro },
        ],
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // La CSP usa un nonce por solicitud (src/proxy.ts): ninguna página se puede
  // prerenderizar, porque sus scripts quedarían sin nonce y el navegador los bloquearía.
  await connection();
  // El tema se resuelve en el servidor (cookie → `data-tema`): el primer HTML ya
  // llega con el tema elegido, sin script en línea. Sin atributo manda el CSS
  // (`prefers-color-scheme`, ver globals.css).
  const tema = await temaDeLaSolicitud();
  return (
    <html lang="es-CL" data-tema={atributoTema(tema)} className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ProveedorTema inicial={tema}>{children}</ProveedorTema>
        <Toaster />
      </body>
    </html>
  );
}
