import fs from "node:fs";
import path from "node:path";
import bwipjs from "bwip-js/node";

/**
 * Video sintético para la cámara falsa de Chromium
 * (`--use-file-for-fake-video-capture`): un código de barras nítido sobre fondo
 * blanco, en formato Y4M (YUV 4:2:0 sin comprimir). Chromium lo reproduce en
 * bucle como si fuera la cámara del dispositivo.
 */

const ANCHO = 640;
const ALTO = 480;
const CUADROS = 10;

export interface CodigoDePrueba {
  /** `gs1datamatrix` espera el texto con paréntesis: `(01)…(17)…(10)…`. */
  tipo: "gs1datamatrix" | "datamatrix" | "ean13" | "code128" | "qrcode";
  texto: string;
}

/** Matriz de módulos (true = oscuro) del código, sin zona de silencio. */
function modulos(codigo: CodigoDePrueba): boolean[][] {
  const [r] = bwipjs.raw({ bcid: codigo.tipo, text: codigo.texto }) as unknown as [
    { pixs?: number[]; pixx?: number; pixy?: number; sbs?: number[] },
  ];
  if (r.pixs && r.pixx && r.pixy) {
    const filas: boolean[][] = [];
    for (let y = 0; y < r.pixy; y++) filas.push(r.pixs.slice(y * r.pixx, (y + 1) * r.pixx).map((v) => v === 1));
    return filas;
  }
  if (r.sbs) {
    // Código lineal: anchos alternados de barra y espacio; se dibuja como una franja alta.
    const fila: boolean[] = [];
    r.sbs.forEach((ancho, i) => {
      for (let k = 0; k < ancho; k++) fila.push(i % 2 === 0);
    });
    return Array.from({ length: Math.round(fila.length * 0.45) }, () => fila);
  }
  throw new Error(`bwip-js no devolvió módulos para ${codigo.tipo}`);
}

/** Escribe el video Y4M del código y devuelve su ruta absoluta. */
export function escribirVideoDeCodigo(ruta: string, codigo: CodigoDePrueba): string {
  const matriz = modulos(codigo);
  const columnas = matriz[0]!.length;
  const filas = matriz.length;
  // El código ocupa cerca de la mitad del cuadro, centrado, con margen blanco amplio.
  const escala = Math.max(2, Math.floor(Math.min((ANCHO * 0.6) / columnas, (ALTO * 0.6) / filas)));
  const x0 = Math.floor((ANCHO - columnas * escala) / 2);
  const y0 = Math.floor((ALTO - filas * escala) / 2);

  const luma = Buffer.alloc(ANCHO * ALTO, 235); // blanco de video
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      if (!matriz[f]![c]) continue;
      for (let dy = 0; dy < escala; dy++) {
        luma.fill(16, (y0 + f * escala + dy) * ANCHO + x0 + c * escala, (y0 + f * escala + dy) * ANCHO + x0 + (c + 1) * escala);
      }
    }
  }
  const croma = Buffer.alloc((ANCHO / 2) * (ALTO / 2) * 2, 128); // sin color
  const partes: Buffer[] = [Buffer.from(`YUV4MPEG2 W${ANCHO} H${ALTO} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < CUADROS; i++) partes.push(Buffer.from("FRAME\n"), luma, croma);

  const absoluta = path.resolve(ruta);
  fs.mkdirSync(path.dirname(absoluta), { recursive: true });
  fs.writeFileSync(absoluta, Buffer.concat(partes));
  return absoluta;
}

/** Argumentos de Chromium para usar ese video como cámara y conceder el permiso sin preguntar. */
export function argumentosCamaraFalsa(rutaVideo: string): string[] {
  return ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${rutaVideo}`];
}
