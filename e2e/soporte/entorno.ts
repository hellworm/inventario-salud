import path from "node:path";

/** Cuentas del seed de demostración (prisma/seed.ts). */
export const CUENTAS = {
  admin: { email: "admin@redinsumos.cl", password: "Admin.Demo.2026", nombre: "Carolina Fuentes" },
  bodega: { email: "bodega@redinsumos.cl", password: "Bodega.Demo.2026", nombre: "Matías Rojas" },
  visita: { email: "visita@redinsumos.cl", password: "Visita.Demo.2026", nombre: "Javiera Soto" },
  valpo: { email: "bodega.valparaiso@redinsumos.cl", password: "Bodega.Valpo.2026", nombre: "Ignacio Vera" },
} as const;
export type Rol = keyof typeof CUENTAS;
export const ROLES = Object.keys(CUENTAS) as Rol[];

/** Cuenta del seed que debe cambiar su contraseña (la suite nunca la cambia). */
export const CUENTA_PENDIENTE = { email: "nuevo@redinsumos.cl", password: "Temporal.2026" } as const;

export const CENTROS = {
  nunoa: "Centro de Diálisis Ñuñoa",
  valpo: "Consultorio Cerro Alegre",
  conce: "Centro de Diálisis Concepción",
} as const;

/** Ubicaciones del seed (nombre exacto) por centro. */
export const UBICACIONES = {
  nunoaBodega: { nombre: "Bodega central", centro: CENTROS.nunoa },
  nunoaSala1: { nombre: "Sala de hemodiálisis 1", centro: CENTROS.nunoa },
  nunoaSala2: { nombre: "Sala de hemodiálisis 2", centro: CENTROS.nunoa },
  valpoBodega: { nombre: "Bodega de insumos", centro: CENTROS.valpo },
  conceBodega: { nombre: "Bodega", centro: CENTROS.conce },
} as const;
export type Ubicacion = (typeof UBICACIONES)[keyof typeof UBICACIONES];

/** Archivo con la sesión guardada de cada rol (lo genera `sesiones.setup.ts`). */
export function rutaSesion(rol: Rol): string {
  return path.join(__dirname, "..", ".sesiones", `${rol}.json`);
}

let correlativo = 0;
/** Sufijo único (mayúsculas y dígitos) para que cada test cree sus propios datos. */
export function sufijo(): string {
  correlativo += 1;
  const azar = Math.floor(Math.random() * 36 ** 3).toString(36).padStart(3, "0");
  return `${Date.now().toString(36)}${azar}${correlativo.toString(36)}`.toUpperCase();
}

/** Día calendario en America/Santiago, desplazado `dias` días: `YYYY-MM-DD`. */
export function diaSantiago(dias = 0, ahora = new Date()): string {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(ahora);
  const fecha = new Date(`${hoy}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → `dd-MM-yyyy`, como lo muestra la aplicación. */
export function comoSeMuestra(dia: string): string {
  const [a, m, d] = dia.split("-");
  return `${d}-${m}-${a}`;
}

/** RUT chileno válido generado al azar (cuerpo de 8 dígitos + dígito verificador). */
export function rutValido(): { canonico: string; conPuntos: string; cuerpo: number } {
  const cuerpo = 70_000_000 + Math.floor(Math.random() * 9_000_000);
  let suma = 0;
  let factor = 2;
  for (const digito of String(cuerpo).split("").reverse()) {
    suma += Number(digito) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  const conPuntos = `${String(cuerpo).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
  return { canonico: `${cuerpo}-${dv}`, conPuntos, cuerpo };
}
