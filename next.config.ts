import type { NextConfig } from "next";

const esDesarrollo = process.env.NODE_ENV !== "production";

/**
 * CSP de respaldo, estática y sin scripts en línea. Las páginas y los
 * manejadores de ruta reciben OTRA, con un nonce por solicitud, desde
 * `src/proxy.ts` (que reemplaza a esta). Esta queda para lo que el proxy no
 * atiende: archivos estáticos (p. ej. `/icon.svg`, `/_next/static/*`).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self'${esDesarrollo ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${esDesarrollo ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const cabecerasSeguridad = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(esDesarrollo
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]),
];

/**
 * Orígenes adicionales admitidos para las Server Actions (opcional).
 *
 * Next rechaza una Server Action cuya cabecera `Origin` no coincide con el
 * host de la solicitud (`X-Forwarded-Host` o `Host`): es su protección CSRF.
 * Un proxy inverso bien configurado reenvía el host público y no hace falta
 * nada. Solo si la aplicación queda detrás de un proxy o túnel que NO lo
 * reenvía (p. ej. una vista previa con otro dominio), se declaran aquí los
 * hosts públicos exactos, separados por coma, AL COMPILAR (`npm run build`):
 *
 *   SERVER_ACTIONS_ORIGENES="vista-previa.ejemplo.cl" npm run build
 *
 * Sin la variable no se admite ningún origen adicional (lo normal en producción).
 */
const origenesServerActions = (process.env.SERVER_ACTIONS_ORIGENES ?? "")
  .split(",")
  .map((o) => o.trim().toLowerCase())
  .filter((o) => /^(\*\.)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(o));

const nextConfig: NextConfig = {
  ...(origenesServerActions.length > 0 ? { experimental: { serverActions: { allowedOrigins: origenesServerActions } } } : {}),
  // Todas las vistas dependen de la sesión y de stock en tiempo real: se
  // renderizan por solicitud. No se usa Cache Components (ver ARQUITECTURA).
  // Build autocontenido en `.next/standalone` (lo usa el Dockerfile).
  output: "standalone",
  outputFileTracingRoot: import.meta.dirname,
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["@node-rs/argon2"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: cabecerasSeguridad }];
  },
};

export default nextConfig;
