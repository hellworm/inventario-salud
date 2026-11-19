/**
 * Seed de demostración de RedInsumos.
 *
 * - Datos de referencia (centros, ubicaciones, catálogo, proveedores, usuarios,
 *   parámetros de stock): se crean o actualizan (idempotente).
 * - Historial de ~60 días: se genera A TRAVÉS de los servicios de inventario
 *   (con fecha retroactiva), por lo que existencias, libro mayor y auditoría
 *   quedan coherentes. Solo se genera si aún no hay movimientos.
 *
 * Uso: `npm run db:seed`  (para regenerar todo: `npm run db:reset`).
 */
import { calcularDv } from "@/lib/chile/rut";
import { diaADate, hoyEnSantiago, inicioDelDia, sumarDias, type DiaISO } from "@/lib/fechas";
import type { Actor } from "@/lib/permisos";
import { hashearPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { ErrorDominio } from "@/server/errores";
import {
  registrarAjuste,
  registrarIngreso,
  registrarMerma,
  registrarRetiro,
  registrarTraslado,
} from "@/server/servicios";

// ---------------------------------------------------------------------------
// Azar determinista: el seed produce siempre los mismos datos.
// ---------------------------------------------------------------------------
function crearAzar(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const azar = crearAzar(20260115);
const entre = (min: number, max: number) => Math.floor(azar() * (max - min + 1)) + min;
const elegir = <T>(lista: readonly T[]): T => lista[Math.floor(azar() * lista.length)]!;
const rut = (cuerpo: number) => `${cuerpo}-${calcularDv(cuerpo)}`;

// ---------------------------------------------------------------------------
// Datos de referencia
// ---------------------------------------------------------------------------
type ClaveCentro = "nunoa" | "valpo" | "conce";
type Perfil = "DIALISIS" | "CONSULTORIO";

const CENTROS: {
  clave: ClaveCentro;
  perfil: Perfil;
  nombre: string;
  tipo: "DIALISIS" | "CONSULTORIO";
  rut: string;
  direccion: string;
  comuna: string;
  region: string;
  telefono: string;
  /** Factor de tamaño: escala consumos y mínimos. */
  escala: number;
  ubicaciones: { clave: "bodega" | "sala" | "sala2" | "frio"; nombre: string; tipo: "BODEGA" | "SALA" | "REFRIGERADO"; descripcion: string }[];
}[] = [
  {
    clave: "nunoa",
    perfil: "DIALISIS",
    nombre: "Centro de Diálisis Ñuñoa",
    tipo: "DIALISIS",
    rut: rut(76_482_310),
    direccion: "Av. Irarrázaval 2841",
    comuna: "Ñuñoa",
    region: "Metropolitana de Santiago",
    telefono: "+56 2 2345 6701",
    escala: 1,
    ubicaciones: [
      { clave: "bodega", nombre: "Bodega central", tipo: "BODEGA", descripcion: "Bodega principal, primer piso" },
      { clave: "sala", nombre: "Sala de hemodiálisis 1", tipo: "SALA", descripcion: "12 puestos, turnos mañana y tarde" },
      { clave: "sala2", nombre: "Sala de hemodiálisis 2", tipo: "SALA", descripcion: "8 puestos" },
      { clave: "frio", nombre: "Refrigerador de fármacos", tipo: "REFRIGERADO", descripcion: "2 a 8 °C, con registro de temperatura" },
    ],
  },
  {
    clave: "valpo",
    perfil: "CONSULTORIO",
    nombre: "Consultorio Cerro Alegre",
    tipo: "CONSULTORIO",
    rut: rut(65_103_877),
    direccion: "Lautaro Rosas 485",
    comuna: "Valparaíso",
    region: "Valparaíso",
    telefono: "+56 32 221 4480",
    escala: 1,
    ubicaciones: [
      { clave: "bodega", nombre: "Bodega de insumos", tipo: "BODEGA", descripcion: "Segundo piso, acceso restringido" },
      { clave: "sala", nombre: "Box de procedimientos", tipo: "SALA", descripcion: "Curaciones y toma de muestras" },
      { clave: "frio", nombre: "Refrigerador de vacunas", tipo: "REFRIGERADO", descripcion: "2 a 8 °C" },
    ],
  },
  {
    clave: "conce",
    perfil: "DIALISIS",
    nombre: "Centro de Diálisis Concepción",
    tipo: "DIALISIS",
    rut: rut(77_215_904),
    direccion: "Av. Paicaví 1120",
    comuna: "Concepción",
    region: "Biobío",
    telefono: "+56 41 274 9035",
    escala: 0.6,
    ubicaciones: [
      { clave: "bodega", nombre: "Bodega", tipo: "BODEGA", descripcion: "Bodega única del centro" },
      { clave: "sala", nombre: "Sala de hemodiálisis", tipo: "SALA", descripcion: "10 puestos" },
      { clave: "frio", nombre: "Refrigerador", tipo: "REFRIGERADO", descripcion: "2 a 8 °C" },
    ],
  },
];

const PROVEEDORES = [
  { rut: rut(76_931_245), razonSocial: "Insumos Renales del Pacífico SpA", contacto: "Paula Henríquez", telefono: "+56 2 2890 1144", email: "ventas@renalespacifico.example" },
  { rut: rut(77_058_612), razonSocial: "Distribuidora Clínica Andina Ltda.", contacto: "Rodrigo Maturana", telefono: "+56 2 2714 8830", email: "pedidos@clinicaandina.example" },
  { rut: rut(96_754_380), razonSocial: "Farmacéutica Austral S.A.", contacto: "Marcela Oyarzún", telefono: "+56 2 2433 9020", email: "contacto@farmaustral.example" },
  { rut: rut(76_340_199), razonSocial: "Protección Sanitaria Biobío SpA", contacto: "Felipe Sanhueza", telefono: "+56 41 291 5507", email: "ventas@proteccionbiobio.example" },
  { rut: rut(78_112_467), razonSocial: "Suministros Médicos Cordillera Ltda.", contacto: "Daniela Araya", telefono: "+56 32 268 3312", email: "ventas@smcordillera.example" },
] as const;

interface DefInsumo {
  codigo: string;
  nombre: string;
  categoria: string;
  unidad: string;
  presentacion?: string;
  fabricante?: string;
  registro?: string;
  frio?: boolean;
  /** `false` para insumos que no controlan vencimiento. */
  vence?: boolean;
  /** Costo unitario referencial en CLP. */
  costo: number;
  /** Consumo diario promedio en un centro de diálisis (escala 1). 0 = no se usa. */
  dialisis: number;
  /** Consumo diario promedio en un consultorio. 0 = no se usa. */
  consultorio: number;
  /** Índice del proveedor habitual. */
  proveedor: number;
}

const C = {
  dializadores: "Dializadores y filtros",
  accesos: "Líneas y accesos vasculares",
  soluciones: "Soluciones y concentrados",
  farmacos: "Fármacos",
  jeringas: "Jeringas y agujas",
  epp: "Elementos de protección personal",
  antisepticos: "Antisépticos y desinfectantes",
  curacion: "Curación",
} as const;

const INSUMOS: DefInsumo[] = [
  // Dializadores
  { codigo: "DIA-AF14", nombre: "Dializador alto flujo 1,4 m²", categoria: C.dializadores, unidad: "unidad", presentacion: "Polisulfona, caja de 24", fabricante: "Nefromed", registro: "DM-1482/21", costo: 9800, dialisis: 8, consultorio: 0, proveedor: 0 },
  { codigo: "DIA-AF16", nombre: "Dializador alto flujo 1,6 m²", categoria: C.dializadores, unidad: "unidad", presentacion: "Polisulfona, caja de 24", fabricante: "Nefromed", registro: "DM-1483/21", costo: 10400, dialisis: 14, consultorio: 0, proveedor: 0 },
  { codigo: "DIA-AF18", nombre: "Dializador alto flujo 1,8 m²", categoria: C.dializadores, unidad: "unidad", presentacion: "Polisulfona, caja de 24", fabricante: "Nefromed", registro: "DM-1484/21", costo: 11200, dialisis: 18, consultorio: 0, proveedor: 0 },
  { codigo: "DIA-AF21", nombre: "Dializador alto flujo 2,1 m²", categoria: C.dializadores, unidad: "unidad", presentacion: "Polisulfona, caja de 24", fabricante: "Nefromed", registro: "DM-1485/21", costo: 12600, dialisis: 6, consultorio: 0, proveedor: 0 },
  { codigo: "DIA-BF15", nombre: "Dializador bajo flujo 1,5 m²", categoria: C.dializadores, unidad: "unidad", presentacion: "Caja de 24", fabricante: "RenalTec", registro: "DM-0977/19", costo: 8900, dialisis: 3, consultorio: 0, proveedor: 0 },
  // Líneas y accesos
  { codigo: "LIN-AV", nombre: "Línea arteriovenosa adulto", categoria: C.accesos, unidad: "unidad", presentacion: "Set arterial + venoso, caja de 24", fabricante: "RenalTec", registro: "DM-2051/20", costo: 3900, dialisis: 48, consultorio: 0, proveedor: 0 },
  { codigo: "AGU-F15", nombre: "Aguja de fístula 15G", categoria: C.accesos, unidad: "unidad", presentacion: "Con protector, caja de 100", fabricante: "Vascumed", registro: "DM-3310/22", costo: 520, dialisis: 36, consultorio: 0, proveedor: 0 },
  { codigo: "AGU-F16", nombre: "Aguja de fístula 16G", categoria: C.accesos, unidad: "unidad", presentacion: "Con protector, caja de 100", fabricante: "Vascumed", registro: "DM-3311/22", costo: 520, dialisis: 52, consultorio: 0, proveedor: 0 },
  { codigo: "AGU-F17", nombre: "Aguja de fístula 17G", categoria: C.accesos, unidad: "unidad", presentacion: "Con protector, caja de 100", fabricante: "Vascumed", registro: "DM-3312/22", costo: 540, dialisis: 8, consultorio: 0, proveedor: 0 },
  { codigo: "CAT-HD12", nombre: "Catéter de hemodiálisis doble lumen 12F × 20 cm", categoria: C.accesos, unidad: "unidad", presentacion: "Kit de inserción", fabricante: "Vascumed", registro: "DM-4120/21", costo: 38500, dialisis: 0.4, consultorio: 0, proveedor: 0 },
  { codigo: "CAT-IV20", nombre: "Catéter venoso periférico 20G", categoria: C.accesos, unidad: "unidad", presentacion: "Caja de 50", fabricante: "Medisur", registro: "DM-0815/20", costo: 690, dialisis: 2, consultorio: 9, proveedor: 1 },
  { codigo: "CAT-IV22", nombre: "Catéter venoso periférico 22G", categoria: C.accesos, unidad: "unidad", presentacion: "Caja de 50", fabricante: "Medisur", registro: "DM-0816/20", costo: 690, dialisis: 0, consultorio: 7, proveedor: 1 },
  { codigo: "EQU-FLE", nombre: "Equipo de fleboclisis macrogoteo", categoria: C.accesos, unidad: "unidad", presentacion: "Bajada de suero con filtro", fabricante: "Medisur", registro: "DM-0642/19", costo: 480, dialisis: 20, consultorio: 6, proveedor: 1 },
  // Soluciones y concentrados
  { codigo: "CON-ACI", nombre: "Concentrado ácido para hemodiálisis", categoria: C.soluciones, unidad: "bidón", presentacion: "Bidón 5 L, K 2,0 / Ca 3,0", fabricante: "Dialquim", registro: "F-21455/20", costo: 5400, dialisis: 30, consultorio: 0, proveedor: 0 },
  { codigo: "BIC-CAR", nombre: "Bicarbonato en cartucho 720 g", categoria: C.soluciones, unidad: "cartucho", presentacion: "Caja de 10", fabricante: "Dialquim", registro: "F-21460/20", costo: 4700, dialisis: 46, consultorio: 0, proveedor: 0 },
  { codigo: "SUE-500", nombre: "Suero fisiológico 0,9% 500 ml", categoria: C.soluciones, unidad: "bolsa", presentacion: "Caja de 20", fabricante: "Laboratorio Sanderson", registro: "F-9912/18", costo: 890, dialisis: 22, consultorio: 8, proveedor: 2 },
  { codigo: "SUE-1000", nombre: "Suero fisiológico 0,9% 1000 ml", categoria: C.soluciones, unidad: "bolsa", presentacion: "Caja de 12", fabricante: "Laboratorio Sanderson", registro: "F-9913/18", costo: 1290, dialisis: 50, consultorio: 2, proveedor: 2 },
  { codigo: "AGU-EST10", nombre: "Agua estéril para inyectables 10 ml", categoria: C.soluciones, unidad: "ampolla", presentacion: "Caja de 100", fabricante: "Laboratorio Sanderson", registro: "F-7740/17", costo: 190, dialisis: 6, consultorio: 10, proveedor: 2 },
  // Fármacos
  { codigo: "HEP-5000", nombre: "Heparina sódica 5.000 UI/ml", categoria: C.farmacos, unidad: "frasco", presentacion: "Frasco ampolla 5 ml, caja de 25", fabricante: "Farmacéutica Austral", registro: "F-13320/19", costo: 2850, dialisis: 16, consultorio: 0, proveedor: 2 },
  { codigo: "EPO-4000", nombre: "Eritropoyetina 4.000 UI", categoria: C.farmacos, unidad: "unidad", presentacion: "Jeringa prellenada", fabricante: "Biogénesis Sur", registro: "B-2204/21", frio: true, costo: 7900, dialisis: 9, consultorio: 0, proveedor: 2 },
  { codigo: "HIE-100", nombre: "Hierro sacarosa 100 mg/5 ml", categoria: C.farmacos, unidad: "ampolla", presentacion: "Caja de 5", fabricante: "Farmacéutica Austral", registro: "F-18804/20", costo: 4300, dialisis: 5, consultorio: 0, proveedor: 2 },
  { codigo: "LID-2", nombre: "Lidocaína 2% 5 ml", categoria: C.farmacos, unidad: "ampolla", presentacion: "Caja de 100", fabricante: "Laboratorio Sanderson", registro: "F-5521/16", costo: 310, dialisis: 3, consultorio: 4, proveedor: 2 },
  { codigo: "VAC-INF", nombre: "Vacuna antiinfluenza", categoria: C.farmacos, unidad: "unidad", presentacion: "Jeringa prellenada 0,5 ml", fabricante: "Biogénesis Sur", registro: "B-1870/24", frio: true, costo: 5200, dialisis: 0, consultorio: 12, proveedor: 2 },
  // Jeringas y agujas
  { codigo: "JER-3", nombre: "Jeringa desechable 3 ml", categoria: C.jeringas, unidad: "unidad", presentacion: "Sin aguja, caja de 100", fabricante: "Medisur", registro: "DM-0301/19", costo: 75, dialisis: 20, consultorio: 30, proveedor: 1 },
  { codigo: "JER-5", nombre: "Jeringa desechable 5 ml", categoria: C.jeringas, unidad: "unidad", presentacion: "Sin aguja, caja de 100", fabricante: "Medisur", registro: "DM-0302/19", costo: 85, dialisis: 30, consultorio: 22, proveedor: 1 },
  { codigo: "JER-10", nombre: "Jeringa desechable 10 ml", categoria: C.jeringas, unidad: "unidad", presentacion: "Sin aguja, caja de 100", fabricante: "Medisur", registro: "DM-0303/19", costo: 110, dialisis: 60, consultorio: 12, proveedor: 1 },
  { codigo: "JER-20", nombre: "Jeringa desechable 20 ml", categoria: C.jeringas, unidad: "unidad", presentacion: "Sin aguja, caja de 50", fabricante: "Medisur", registro: "DM-0304/19", costo: 160, dialisis: 40, consultorio: 4, proveedor: 1 },
  { codigo: "JER-INS", nombre: "Jeringa de insulina 1 ml con aguja", categoria: C.jeringas, unidad: "unidad", presentacion: "30G × 8 mm, caja de 100", fabricante: "Medisur", registro: "DM-0309/19", costo: 120, dialisis: 0, consultorio: 14, proveedor: 1 },
  { codigo: "AGU-21", nombre: "Aguja hipodérmica 21G × 1½\"", categoria: C.jeringas, unidad: "unidad", presentacion: "Caja de 100", fabricante: "Medisur", registro: "DM-0320/19", costo: 35, dialisis: 45, consultorio: 35, proveedor: 1 },
  { codigo: "AGU-23", nombre: "Aguja hipodérmica 23G × 1\"", categoria: C.jeringas, unidad: "unidad", presentacion: "Caja de 100", fabricante: "Medisur", registro: "DM-0321/19", costo: 35, dialisis: 0, consultorio: 28, proveedor: 1 },
  // EPP
  { codigo: "GUA-NS", nombre: "Guantes de nitrilo talla S", categoria: C.epp, unidad: "caja", presentacion: "Caja de 100 unidades, sin polvo", fabricante: "Protex", costo: 4900, dialisis: 2, consultorio: 1, proveedor: 3 },
  { codigo: "GUA-NM", nombre: "Guantes de nitrilo talla M", categoria: C.epp, unidad: "caja", presentacion: "Caja de 100 unidades, sin polvo", fabricante: "Protex", costo: 4900, dialisis: 4, consultorio: 2, proveedor: 3 },
  { codigo: "GUA-NL", nombre: "Guantes de nitrilo talla L", categoria: C.epp, unidad: "caja", presentacion: "Caja de 100 unidades, sin polvo", fabricante: "Protex", costo: 4900, dialisis: 2, consultorio: 1, proveedor: 3 },
  { codigo: "GUA-EST75", nombre: "Guantes quirúrgicos estériles 7,5", categoria: C.epp, unidad: "par", presentacion: "Látex, caja de 50 pares", fabricante: "Protex", registro: "DM-1190/20", costo: 650, dialisis: 3, consultorio: 5, proveedor: 3 },
  { codigo: "MAS-3P", nombre: "Mascarilla quirúrgica 3 pliegues", categoria: C.epp, unidad: "caja", presentacion: "Caja de 50 unidades", fabricante: "Protex", costo: 2400, dialisis: 3, consultorio: 2, proveedor: 3 },
  { codigo: "MAS-N95", nombre: "Mascarilla N95", categoria: C.epp, unidad: "unidad", presentacion: "Caja de 20", fabricante: "Protex", costo: 890, dialisis: 4, consultorio: 3, proveedor: 3 },
  { codigo: "PEC-DES", nombre: "Pechera desechable manga larga", categoria: C.epp, unidad: "unidad", presentacion: "Paquete de 10", fabricante: "Protex", costo: 780, dialisis: 24, consultorio: 6, proveedor: 3 },
  { codigo: "GOR-DES", nombre: "Gorro desechable tipo clip", categoria: C.epp, unidad: "paquete", presentacion: "Paquete de 100", fabricante: "Protex", vence: false, costo: 3200, dialisis: 0.4, consultorio: 0.2, proveedor: 3 },
  { codigo: "ANT-PRO", nombre: "Antiparras de protección", categoria: C.epp, unidad: "unidad", presentacion: "Policarbonato, reutilizable", fabricante: "Protex", vence: false, costo: 3900, dialisis: 0.15, consultorio: 0.1, proveedor: 3 },
  // Antisépticos
  { codigo: "ALC-70", nombre: "Alcohol 70% 1 L", categoria: C.antisepticos, unidad: "litro", presentacion: "Botella 1 L", fabricante: "Dialquim", registro: "F-3301/15", costo: 2100, dialisis: 3, consultorio: 2, proveedor: 4 },
  { codigo: "ALC-GEL", nombre: "Alcohol gel 500 ml", categoria: C.antisepticos, unidad: "frasco", presentacion: "Con dosificador", fabricante: "Dialquim", registro: "F-3350/15", costo: 2600, dialisis: 2, consultorio: 1.5, proveedor: 4 },
  { codigo: "CLO-2", nombre: "Clorhexidina 2% solución 500 ml", categoria: C.antisepticos, unidad: "frasco", presentacion: "Solución tópica acuosa", fabricante: "Farmacéutica Austral", registro: "F-11260/18", costo: 3400, dialisis: 3, consultorio: 1, proveedor: 4 },
  { codigo: "CLO-JAB", nombre: "Clorhexidina jabonosa 4% 1 L", categoria: C.antisepticos, unidad: "frasco", presentacion: "Lavado clínico de manos", fabricante: "Farmacéutica Austral", registro: "F-11262/18", costo: 5900, dialisis: 1.2, consultorio: 0.6, proveedor: 4 },
  { codigo: "POV-10", nombre: "Povidona yodada 10% 500 ml", categoria: C.antisepticos, unidad: "frasco", presentacion: "Solución tópica", fabricante: "Farmacéutica Austral", registro: "F-8045/17", costo: 3900, dialisis: 0.5, consultorio: 0.6, proveedor: 4 },
  { codigo: "HIP-5", nombre: "Hipoclorito de sodio 5% 5 L", categoria: C.antisepticos, unidad: "bidón", presentacion: "Desinfección de superficies y equipos", fabricante: "Dialquim", costo: 4200, dialisis: 1.5, consultorio: 0.3, proveedor: 4 },
  // Curación
  { codigo: "GAS-EST", nombre: "Gasa estéril 10 × 10 cm", categoria: C.curacion, unidad: "unidad", presentacion: "Sobre de 5 unidades", fabricante: "Medisur", registro: "DM-0410/19", costo: 180, dialisis: 80, consultorio: 45, proveedor: 1 },
  { codigo: "GAS-NOE", nombre: "Gasa no estéril 10 × 10 cm", categoria: C.curacion, unidad: "paquete", presentacion: "Paquete de 100", fabricante: "Medisur", vence: false, costo: 2900, dialisis: 1.5, consultorio: 1.2, proveedor: 1 },
  { codigo: "APO-TRA", nombre: "Apósito transparente 10 × 12 cm", categoria: C.curacion, unidad: "unidad", presentacion: "Con marco de aplicación, caja de 50", fabricante: "Medisur", registro: "DM-0455/19", costo: 890, dialisis: 10, consultorio: 6, proveedor: 1 },
  { codigo: "APO-GAS", nombre: "Apósito de gasa 10 × 20 cm", categoria: C.curacion, unidad: "unidad", presentacion: "Estéril, envase individual", fabricante: "Medisur", registro: "DM-0456/19", costo: 240, dialisis: 12, consultorio: 20, proveedor: 1 },
  { codigo: "TEL-ADH", nombre: "Tela adhesiva microporosa 2,5 cm × 9 m", categoria: C.curacion, unidad: "rollo", presentacion: "Caja de 12 rollos", fabricante: "Medisur", vence: false, costo: 990, dialisis: 8, consultorio: 4, proveedor: 1 },
  { codigo: "VEN-ELA", nombre: "Venda elástica 10 cm × 4 m", categoria: C.curacion, unidad: "unidad", fabricante: "Medisur", vence: false, costo: 650, dialisis: 0, consultorio: 3, proveedor: 1 },
  { codigo: "TOR-ALG", nombre: "Tórulas de algodón", categoria: C.curacion, unidad: "bolsa", presentacion: "Bolsa de 500 g", fabricante: "Medisur", vence: false, costo: 3100, dialisis: 0.5, consultorio: 0.8, proveedor: 1 },
];

const USUARIOS: {
  email: string;
  nombre: string;
  rol: Actor["rol"];
  password: string;
  centros: ClaveCentro[];
  debeCambiarPassword?: boolean;
}[] = [
  { email: "admin@redinsumos.cl", nombre: "Carolina Fuentes", rol: "ADMIN", password: "Admin.Demo.2026", centros: [] },
  { email: "bodega@redinsumos.cl", nombre: "Matías Rojas", rol: "BODEGUERO", password: "Bodega.Demo.2026", centros: ["nunoa"] },
  { email: "visita@redinsumos.cl", nombre: "Javiera Soto", rol: "VISITANTE", password: "Visita.Demo.2026", centros: ["nunoa"] },
  { email: "bodega.valparaiso@redinsumos.cl", nombre: "Ignacio Vera", rol: "BODEGUERO", password: "Bodega.Valpo.2026", centros: ["valpo"] },
  { email: "bodega.concepcion@redinsumos.cl", nombre: "Constanza Riquelme", rol: "BODEGUERO", password: "Bodega.Conce.2026", centros: ["conce"] },
  // Cuenta para probar el cambio de contraseña obligatorio del primer ingreso.
  { email: "nuevo@redinsumos.cl", nombre: "Tomás Aguilera", rol: "VISITANTE", password: "Temporal.2026", centros: ["valpo", "conce"], debeCambiarPassword: true },
];

// ---------------------------------------------------------------------------
// Escenarios que garantizan alertas variadas en la demo
// ---------------------------------------------------------------------------
type Escenario = "SIN_STOCK" | "BAJO_MINIMO";
const ESCENARIOS: Record<string, Escenario> = {
  "nunoa:AGU-F17": "SIN_STOCK",
  "nunoa:HIE-100": "SIN_STOCK",
  "nunoa:DIA-AF21": "BAJO_MINIMO",
  "nunoa:GUA-NM": "BAJO_MINIMO",
  "nunoa:SUE-1000": "BAJO_MINIMO",
  "nunoa:CLO-2": "BAJO_MINIMO",
  "valpo:JER-INS": "SIN_STOCK",
  "valpo:VAC-INF": "BAJO_MINIMO",
  "valpo:GAS-EST": "BAJO_MINIMO",
  "valpo:MAS-N95": "BAJO_MINIMO",
  "conce:BIC-CAR": "SIN_STOCK",
  "conce:LIN-AV": "BAJO_MINIMO",
  "conce:ALC-70": "BAJO_MINIMO",
};

/** Lotes olvidados en una ubicación secundaria que vencieron hace `dias` días. */
const LOTES_VENCIDOS: { centro: ClaveCentro; codigo: string; ubicacion: "sala" | "sala2" | "frio"; cantidad: number; dias: number }[] = [
  { centro: "nunoa", codigo: "LID-2", ubicacion: "sala2", cantidad: 18, dias: 12 },
  { centro: "nunoa", codigo: "CLO-JAB", ubicacion: "sala", cantidad: 3, dias: 4 },
  { centro: "nunoa", codigo: "APO-TRA", ubicacion: "sala2", cantidad: 25, dias: 21 },
  { centro: "valpo", codigo: "POV-10", ubicacion: "sala", cantidad: 4, dias: 30 },
  { centro: "valpo", codigo: "GUA-EST75", ubicacion: "sala", cantidad: 14, dias: 7 },
  { centro: "conce", codigo: "HEP-5000", ubicacion: "sala", cantidad: 10, dias: 9 },
];

/** Lotes recibidos hace poco con vencimiento corto (en `dias` días). */
const LOTES_POR_VENCER: { centro: ClaveCentro; codigo: string; dias: number }[] = [
  { centro: "nunoa", codigo: "HEP-5000", dias: 9 },
  { centro: "nunoa", codigo: "DIA-AF16", dias: 24 },
  { centro: "nunoa", codigo: "CON-ACI", dias: 41 },
  { centro: "nunoa", codigo: "MAS-N95", dias: 55 },
  { centro: "nunoa", codigo: "CAT-HD12", dias: 78 },
  { centro: "valpo", codigo: "VAC-INF", dias: 16 },
  { centro: "valpo", codigo: "SUE-500", dias: 37 },
  { centro: "valpo", codigo: "CLO-2", dias: 66 },
  { centro: "conce", codigo: "EPO-4000", dias: 13 },
  { centro: "conce", codigo: "DIA-AF18", dias: 48 },
  { centro: "conce", codigo: "AGU-F16", dias: 85 },
];

const MOTIVOS_RETIRO: Record<Perfil, readonly string[]> = {
  DIALISIS: ["Turno mañana", "Turno tarde", "Turno noche", "Reposición de sala", "Procedimiento de acceso vascular"],
  CONSULTORIO: ["Box de procedimientos", "Curaciones", "Toma de muestras", "Vacunatorio", "Atención domiciliaria"],
};

// ---------------------------------------------------------------------------
// Carga de datos de referencia
// ---------------------------------------------------------------------------
async function sembrarReferencia() {
  const centros = new Map<ClaveCentro, { id: string; ubicaciones: Map<string, string> }>();
  for (const c of CENTROS) {
    const datos = { tipo: c.tipo, rut: c.rut, direccion: c.direccion, comuna: c.comuna, region: c.region, telefono: c.telefono };
    const centro = await db.centro.upsert({ where: { nombre: c.nombre }, update: datos, create: { nombre: c.nombre, ...datos } });
    const ubicaciones = new Map<string, string>();
    for (const u of c.ubicaciones) {
      const fila = await db.ubicacion.upsert({
        where: { centroId_nombre: { centroId: centro.id, nombre: u.nombre } },
        update: { tipo: u.tipo, descripcion: u.descripcion },
        create: { centroId: centro.id, nombre: u.nombre, tipo: u.tipo, descripcion: u.descripcion },
      });
      ubicaciones.set(u.clave, fila.id);
    }
    centros.set(c.clave, { id: centro.id, ubicaciones });
  }

  const categorias = new Map<string, string>();
  for (const nombre of Object.values(C)) {
    const cat = await db.categoria.upsert({ where: { nombre }, update: {}, create: { nombre } });
    categorias.set(nombre, cat.id);
  }

  const insumos = new Map<string, string>();
  for (const [i, d] of INSUMOS.entries()) {
    const datos = {
      nombre: d.nombre,
      categoriaId: categorias.get(d.categoria)!,
      unidadMedida: d.unidad,
      presentacion: d.presentacion ?? null,
      fabricante: d.fabricante ?? null,
      registroSanitario: d.registro ?? null,
      codigoBarras: `780${String(4_100_000_000 + i * 7919).padStart(10, "0")}`,
      requiereCadenaFrio: d.frio ?? false,
      controlaVencimiento: d.vence ?? true,
    };
    const insumo = await db.insumo.upsert({ where: { codigo: d.codigo }, update: datos, create: { codigo: d.codigo, ...datos } });
    insumos.set(d.codigo, insumo.id);
  }

  const proveedores: string[] = [];
  for (const p of PROVEEDORES) {
    const fila = await db.proveedor.upsert({ where: { rut: p.rut }, update: { ...p }, create: { ...p } });
    proveedores.push(fila.id);
  }

  const actores = new Map<string, Actor>();
  for (const u of USUARIOS) {
    const centroIds = u.centros.map((clave) => centros.get(clave)!.id);
    const comun = {
      nombre: u.nombre,
      rol: u.rol,
      activo: true,
      passwordHash: await hashearPassword(u.password),
      debeCambiarPassword: u.debeCambiarPassword ?? false,
      // Cuenta de demostración: su contraseña temporal no vence (en producción, 72 h).
      passwordTemporalExpira: null,
      intentosFallidos: 0,
      bloqueadoHasta: null,
    };
    const usuario = await db.usuario.upsert({ where: { email: u.email }, update: comun, create: { email: u.email, ...comun } });
    await db.usuarioCentro.deleteMany({ where: { usuarioId: usuario.id } });
    await db.usuarioCentro.createMany({ data: centroIds.map((centroId) => ({ usuarioId: usuario.id, centroId })) });
    actores.set(u.email, { usuarioId: usuario.id, rol: u.rol, centroIds, ip: null });
  }

  // Parámetros de stock: mínimo ≈ 1 semana de consumo, máximo ≈ 1 mes.
  for (const c of CENTROS) {
    const centro = centros.get(c.clave)!;
    for (const d of INSUMOS) {
      const consumo = consumoDiario(d, c);
      if (consumo <= 0) continue;
      const stockMinimo = Math.max(2, Math.ceil(consumo * 7));
      const stockMaximo = Math.ceil(consumo * 30);
      await db.parametroStock.upsert({
        where: { insumoId_centroId: { insumoId: insumos.get(d.codigo)!, centroId: centro.id } },
        update: {},
        create: { insumoId: insumos.get(d.codigo)!, centroId: centro.id, stockMinimo, stockMaximo },
      });
    }
  }

  return { centros, insumos, proveedores, actores };
}

function consumoDiario(d: DefInsumo, c: (typeof CENTROS)[number]): number {
  return (c.perfil === "DIALISIS" ? d.dialisis : d.consultorio) * c.escala;
}

// ---------------------------------------------------------------------------
// Historial de movimientos (a través de los servicios)
// ---------------------------------------------------------------------------
const DIAS_HISTORIAL = 60;

async function sembrarHistorial(ref: Awaited<ReturnType<typeof sembrarReferencia>>) {
  const ahoraReal = new Date();
  const hoy = hoyEnSantiago(ahoraReal);
  const admin = ref.actores.get("admin@redinsumos.cl")!;
  const bodegueros: Record<ClaveCentro, Actor> = {
    nunoa: ref.actores.get("bodega@redinsumos.cl")!,
    valpo: ref.actores.get("bodega.valparaiso@redinsumos.cl")!,
    conce: ref.actores.get("bodega.concepcion@redinsumos.cl")!,
  };

  let correlativoLote = 1000;
  let correlativoDoc = 18_400;
  const nuevoLote = (dia: DiaISO) => `L${dia.slice(2, 4)}${dia.slice(5, 7)}-${++correlativoLote}`;
  const nuevoDocumento = () => (azar() < 0.7 ? `Guía de despacho ${++correlativoDoc}` : `Factura ${++correlativoDoc}`);
  const vencimientoNormal = (dia: DiaISO) => sumarDias(dia, entre(240, 720));
  let total = 0;

  for (const c of CENTROS) {
    const centro = ref.centros.get(c.clave)!;
    const bodega = centro.ubicaciones.get("bodega")!;
    const sala = centro.ubicaciones.get("sala")!;
    const frio = centro.ubicaciones.get("frio")!;
    const bodeguero = bodegueros[c.clave];
    const usados = INSUMOS.filter((d) => consumoDiario(d, c) > 0);
    /** Stock vigente estimado por ubicación principal de cada insumo. */
    const stock = new Map<string, number>();
    const stockSala = new Map<string, number>();
    const ubicacionDe = (d: DefInsumo) => (d.frio ? frio : bodega);
    const enSala = new Set(c.perfil === "DIALISIS" ? ["DIA-AF18", "LIN-AV", "AGU-F16", "JER-10"] : ["GAS-EST", "JER-5"]);

    // Reloj del centro: cada operación avanza unos minutos dentro del día.
    let reloj = new Date(0);
    const iniciarDia = (dia: DiaISO) => {
      reloj = new Date(inicioDelDia(dia).getTime() + (7 * 60 + entre(30, 59)) * 60_000);
    };
    const tic = (): Date => {
      reloj = new Date(reloj.getTime() + entre(2, 11) * 60_000);
      // Nunca en el futuro.
      if (reloj > ahoraReal) reloj = new Date(ahoraReal.getTime() - entre(1, 20) * 1000);
      return reloj;
    };

    const ingresar = async (d: DefInsumo, cantidad: number, vencimiento: DiaISO | undefined, ubicacionId = ubicacionDe(d), dia: DiaISO = hoy) => {
      // Fabricado unos dos años antes de vencer, pero nunca después del día en
      // que se recibe (el servicio rechaza fechas de fabricación futuras).
      const fabricacion = (d.vence ?? true) && vencimiento ? sumarDias(vencimiento, -entre(700, 760)) : undefined;
      const tope = sumarDias(dia, -30);
      await registrarIngreso(
        bodeguero,
        {
          ubicacionId,
          insumoId: ref.insumos.get(d.codigo)!,
          numeroLote: nuevoLote(dia),
          fechaVencimiento: (d.vence ?? true) ? vencimiento : undefined,
          fechaFabricacion: fabricacion && fabricacion > tope ? tope : fabricacion,
          cantidad,
          proveedorId: ref.proveedores[d.proveedor],
          documentoRef: nuevoDocumento(),
          costoUnitario: Math.round(d.costo * (0.95 + azar() * 0.1)),
        },
        { ahora: tic() },
      );
      total++;
      if (ubicacionId === ubicacionDe(d)) stock.set(d.codigo, (stock.get(d.codigo) ?? 0) + cantidad);
    };

    const retirar = async (d: DefInsumo, cantidad: number, ubicacionId: string, mapa: Map<string, number>) => {
      const disponible = mapa.get(d.codigo) ?? 0;
      const real = Math.min(cantidad, disponible);
      if (real <= 0) return;
      try {
        const r = await registrarRetiro(
          bodeguero,
          { ubicacionId, insumoId: ref.insumos.get(d.codigo)!, cantidad: real, motivo: elegir(MOTIVOS_RETIRO[c.perfil]) },
          { ahora: tic() },
        );
        total += r.movimientos.length;
        mapa.set(d.codigo, disponible - real);
      } catch (error) {
        // La estimación en memoria puede diferir si un lote venció en el camino.
        if (error instanceof ErrorDominio && error.codigo === "STOCK_INSUFICIENTE") {
          mapa.set(d.codigo, Number(error.detalle?.disponible ?? 0));
          return;
        }
        throw error;
      }
    };

    for (let offset = -DIAS_HISTORIAL; offset <= 0; offset++) {
      const dia = sumarDias(hoy, offset);
      const diaSemana = diaADate(dia).getUTCDay(); // 0 = domingo
      const esDomingo = diaSemana === 0;
      iniciarDia(dia);

      // Día inicial: carga de stock de apertura.
      if (offset === -DIAS_HISTORIAL) {
        for (const d of usados) {
          const consumo = consumoDiario(d, c);
          await ingresar(d, Math.max(3, Math.ceil(consumo * entre(16, 24))), vencimientoNormal(dia), undefined, dia);
        }
        for (const v of LOTES_VENCIDOS.filter((x) => x.centro === c.clave)) {
          const d = INSUMOS.find((x) => x.codigo === v.codigo)!;
          await ingresar(d, v.cantidad, sumarDias(hoy, -v.dias), centro.ubicaciones.get(v.ubicacion)!, dia);
        }
        continue;
      }
      if (esDomingo && c.perfil === "CONSULTORIO") continue;

      // Lotes de vencimiento corto recibidos hace una semana.
      if (offset === -7) {
        for (const p of LOTES_POR_VENCER.filter((x) => x.centro === c.clave)) {
          const d = INSUMOS.find((x) => x.codigo === p.codigo)!;
          await ingresar(d, Math.max(4, Math.ceil(consumoDiario(d, c) * 12)), sumarDias(hoy, p.dias), undefined, dia);
        }
      }

      // Reposición: cuando el stock estimado baja de ~1,5 semanas de consumo.
      if (!esDomingo) {
        for (const d of usados) {
          const consumo = consumoDiario(d, c);
          const escenario = ESCENARIOS[`${c.clave}:${d.codigo}`];
          // Los insumos con escenario dejan de reponerse las últimas semanas.
          if (escenario && offset > (escenario === "SIN_STOCK" ? -40 : -24)) continue;
          if ((stock.get(d.codigo) ?? 0) < consumo * 10 && azar() < 0.6) {
            await ingresar(d, Math.max(3, Math.ceil(consumo * entre(18, 26))), vencimientoNormal(dia), undefined, dia);
          }
        }
      }

      // Lunes: traslado de bodega a sala de los insumos de uso continuo.
      if (diaSemana === 1) {
        for (const codigo of enSala) {
          const d = INSUMOS.find((x) => x.codigo === codigo)!;
          const cantidad = Math.min(Math.ceil(consumoDiario(d, c) * 2), Math.floor((stock.get(codigo) ?? 0) * 0.4));
          if (cantidad <= 0) continue;
          const lote = await db.existencia.findFirst({
            where: { ubicacionId: bodega, cantidad: { gte: cantidad }, lote: { insumoId: ref.insumos.get(codigo)!, fechaVencimiento: { gte: diaADate(dia) } } },
            orderBy: { lote: { fechaVencimiento: "asc" } },
            select: { loteId: true },
          });
          if (!lote) continue;
          await registrarTraslado(
            admin,
            { loteId: lote.loteId, ubicacionOrigenId: bodega, ubicacionDestinoId: sala, cantidad, motivo: "Reposición semanal de sala" },
            { ahora: tic() },
          );
          total += 2;
          stock.set(codigo, (stock.get(codigo) ?? 0) - cantidad);
          stockSala.set(codigo, (stockSala.get(codigo) ?? 0) + cantidad);
        }
      }

      // Consumo del día. Los insumos de bajo uso no se retiran todos los días.
      for (const d of usados) {
        const consumo = consumoDiario(d, c) * (esDomingo ? 0.3 : 1);
        const probabilidad = consumo >= 6 ? 0.95 : consumo >= 1 ? 0.6 : 0.25;
        if (azar() > probabilidad) continue;
        const cantidad = Math.max(1, Math.round((consumo / probabilidad) * (0.6 + azar() * 0.8)));
        if (enSala.has(d.codigo) && (stockSala.get(d.codigo) ?? 0) >= cantidad) {
          await retirar(d, cantidad, sala, stockSala);
        } else {
          await retirar(d, cantidad, ubicacionDe(d), stock);
        }
      }

      // Eventos puntuales de administración.
      if (offset === -30) {
        // Conteo de inventario con diferencias.
        for (const codigo of c.perfil === "DIALISIS" ? ["JER-20", "GAS-EST"] : ["JER-3", "APO-GAS"]) {
          const existencia = await db.existencia.findFirst({
            where: { ubicacionId: bodega, cantidad: { gt: 10 }, lote: { insumoId: ref.insumos.get(codigo)! } },
            select: { loteId: true },
          });
          if (!existencia) continue;
          const positivo = azar() < 0.4;
          const cantidad = entre(2, 6);
          await registrarAjuste(
            admin,
            { ubicacionId: bodega, loteId: existencia.loteId, sentido: positivo ? "POSITIVO" : "NEGATIVO", cantidad, motivo: "Conteo de inventario", nota: "Diferencia detectada en conteo mensual" },
            { ahora: tic() },
          );
          total++;
          stock.set(codigo, (stock.get(codigo) ?? 0) + (positivo ? cantidad : -cantidad));
        }
      }
      if (offset === -18) {
        const codigo = c.perfil === "DIALISIS" ? "SUE-1000" : "ALC-GEL";
        const existencia = await db.existencia.findFirst({
          where: { ubicacionId: bodega, cantidad: { gt: 4 }, lote: { insumoId: ref.insumos.get(codigo)! } },
          select: { loteId: true },
        });
        if (existencia) {
          await registrarMerma(
            admin,
            { ubicacionId: bodega, loteId: existencia.loteId, cantidad: 3, motivo: "Daño o rotura", nota: "Envases dañados durante el almacenamiento" },
            { ahora: tic() },
          );
          total++;
          stock.set(codigo, (stock.get(codigo) ?? 0) - 3);
        }
      }
    }

    // Cierre: fuerza los escenarios de alerta con un último retiro "normal".
    for (const d of usados) {
      const escenario = ESCENARIOS[`${c.clave}:${d.codigo}`];
      if (!escenario) continue;
      const minimo = Math.max(2, Math.ceil(consumoDiario(d, c) * 7));
      const objetivo = escenario === "SIN_STOCK" ? 0 : Math.max(1, Math.floor(minimo * (0.25 + azar() * 0.45)));
      for (const [ubicacionId, mapa] of [[sala, stockSala], [ubicacionDe(d), stock]] as const) {
        const actual = await db.existencia.aggregate({
          where: { ubicacionId, lote: { insumoId: ref.insumos.get(d.codigo)!, OR: [{ fechaVencimiento: null }, { fechaVencimiento: { gte: diaADate(hoy) } }] } },
          _sum: { cantidad: true },
        });
        const disponible = actual._sum.cantidad ?? 0;
        mapa.set(d.codigo, disponible);
        const mantener = ubicacionId === sala ? 0 : objetivo;
        if (disponible > mantener) {
          await retirar(d, disponible - mantener, ubicacionId, mapa);
        } else if (ubicacionId !== sala && disponible < mantener) {
          // Entrega parcial del proveedor: alcanza para operar, no para el mínimo.
          await ingresar(d, mantener - disponible, vencimientoNormal(hoy));
        }
      }
    }
  }

  // Traslado entre centros (apoyo de Ñuñoa a Concepción) y baja de un lote vencido.
  const nunoa = ref.centros.get("nunoa")!;
  const conce = ref.centros.get("conce")!;
  const apoyo = await db.existencia.findFirst({
    where: { ubicacionId: nunoa.ubicaciones.get("bodega")!, cantidad: { gte: 48 }, lote: { insumoId: ref.insumos.get("DIA-AF16")! } },
    orderBy: { cantidad: "desc" },
    select: { loteId: true },
  });
  if (apoyo) {
    await registrarTraslado(
      admin,
      {
        loteId: apoyo.loteId,
        ubicacionOrigenId: nunoa.ubicaciones.get("bodega")!,
        ubicacionDestinoId: conce.ubicaciones.get("bodega")!,
        cantidad: 24,
        motivo: "Apoyo entre centros",
        nota: "Préstamo de una caja por quiebre de stock en Concepción",
      },
      { ahora: new Date(ahoraReal.getTime() - 26 * 3_600_000) },
    );
    total += 2;
  }
  const vencido = await db.existencia.findFirst({
    where: { ubicacionId: nunoa.ubicaciones.get("sala2")!, cantidad: { gt: 0 }, lote: { insumoId: ref.insumos.get("APO-TRA")! } },
    select: { loteId: true, cantidad: true },
  });
  if (vencido) {
    await registrarMerma(
      admin,
      { ubicacionId: nunoa.ubicaciones.get("sala2")!, loteId: vencido.loteId, cantidad: Math.min(10, vencido.cantidad), motivo: "Vencimiento", nota: "Baja parcial; resto pendiente de retiro" },
      { ahora: new Date(ahoraReal.getTime() - 5 * 3_600_000) },
    );
    total++;
  }
  return total;
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO !== "1") {
    throw new Error("El seed de demostración no se ejecuta en producción (usa SEED_DEMO=1 para forzarlo).");
  }
  const inicio = Date.now();
  console.log("Sembrando datos de referencia…");
  const ref = await sembrarReferencia();

  const existentes = await db.movimiento.count();
  if (existentes > 0) {
    console.log(`Ya existen ${existentes} movimientos: no se regenera el historial.`);
  } else {
    console.log(`Generando historial de ${DIAS_HISTORIAL} días a través de los servicios…`);
    const total = await sembrarHistorial(ref);
    console.log(`Historial generado: ${total} movimientos.`);
  }

  const [centros, insumos, lotes, movimientos] = await Promise.all([
    db.centro.count(),
    db.insumo.count(),
    db.lote.count(),
    db.movimiento.count(),
  ]);
  console.log(
    `Listo en ${((Date.now() - inicio) / 1000).toFixed(1)} s → ${centros} centros, ${insumos} insumos, ${lotes} lotes, ${movimientos} movimientos.`,
  );
  console.log("\nCuentas de demostración:");
  for (const u of USUARIOS) {
    console.log(`  ${u.rol.padEnd(9)} ${u.email.padEnd(36)} ${u.password}${u.debeCambiarPassword ? "  (debe cambiarla al ingresar)" : ""}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
