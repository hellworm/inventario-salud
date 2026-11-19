/**
 * Lectura de códigos de barras desde la cámara.
 *
 * Dos motores con la misma interfaz:
 *  - `nativo`: la API `BarcodeDetector` del navegador (Chrome en Android, macOS
 *    y ChromeOS), si reconoce todos los formatos que necesitamos;
 *  - `zxing`: ZXing compilado a WebAssembly (`zxing-wasm`), para Safari/iOS,
 *    Firefox y Chrome de escritorio. El `.wasm` se sirve desde el propio sitio
 *    (`/_next/static/…`), nunca desde una CDN.
 *
 * Este módulo se carga solo cuando se abre el escáner (import dinámico).
 */

export interface Lectura {
  /** Contenido del código. Las cadenas GS1 llegan crudas (con GS) o con paréntesis: `@/lib/gs1` entiende ambas. */
  texto: string;
  /** Simbología informada por el motor (solo informativa). */
  formato: string;
}

export interface Lector {
  motor: "nativo" | "zxing";
  /** Busca un código en el cuadro actual del video. `null` si no hay ninguno. */
  leer(video: HTMLVideoElement): Promise<Lectura | null>;
  /** Busca un código en una imagen fija (pruebas y diagnóstico). */
  leerImagen(imagen: ImageData): Promise<Lectura | null>;
}

// EAN-13, EAN-8, UPC-A/E, Code 128 (incluye GS1-128), DataMatrix (incluye GS1) y QR.
const FORMATOS_NATIVOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "data_matrix", "qr_code"] as const;
const FORMATOS_ZXING = ["EAN13", "EAN8", "UPCA", "UPCE", "Code128", "DataMatrix", "QRCode"] as const;

interface DeteccionNativa {
  rawValue: string;
  format: string;
}
interface DetectorNativo {
  detect(fuente: CanvasImageSource | ImageData): Promise<DeteccionNativa[]>;
}
interface ConstructorDetector {
  new (opciones?: { formats?: string[] }): DetectorNativo;
  getSupportedFormats(): Promise<string[]>;
}

/** Lado mayor, en píxeles, de la imagen que se entrega a ZXing (más es más lento, no más fiable). */
const LADO_MAXIMO = 1280;

async function lectorNativo(): Promise<Lector | null> {
  const Detector = (globalThis as { BarcodeDetector?: ConstructorDetector }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const soportados = await Detector.getSupportedFormats();
    // Sin DataMatrix o Code 128 no sirve para insumos médicos: se usa ZXing.
    if (!FORMATOS_NATIVOS.every((f) => f === "upc_e" || soportados.includes(f))) return null;
    const detector = new Detector({ formats: FORMATOS_NATIVOS.filter((f) => soportados.includes(f)) });
    const primera = (r: DeteccionNativa[]): Lectura | null =>
      r[0] && r[0].rawValue ? { texto: r[0].rawValue, formato: r[0].format } : null;
    return {
      motor: "nativo",
      leer: async (video) => primera(await detector.detect(video)),
      leerImagen: async (imagen) => primera(await detector.detect(imagen)),
    };
  } catch {
    return null;
  }
}

async function lectorZxing(): Promise<Lector> {
  const { prepareZXingModule, readBarcodes } = await import("zxing-wasm/reader");
  // El binario lo empaqueta Next como archivo estático propio (con hash): sin CDN.
  const urlWasm = new URL("../../../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", import.meta.url).href;
  await prepareZXingModule({
    overrides: { locateFile: (ruta: string, prefijo: string) => (ruta.endsWith(".wasm") ? urlWasm : prefijo + ruta) },
    fireImmediately: true,
  });

  const leerImagen = async (imagen: ImageData): Promise<Lectura | null> => {
    const resultados = await readBarcodes(imagen, {
      formats: [...FORMATOS_ZXING],
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      tryDownscale: true,
      maxNumberOfSymbols: 1,
      // Texto plano: las cadenas GS1 conservan su separador GS (ASCII 29).
      textMode: "Plain",
    });
    const r = resultados.find((x) => x.isValid && x.text);
    if (!r) return null;
    // El identificador de simbología (]d2, ]C1, ]Q3…) le dice al intérprete si es GS1.
    const esGs1 = r.contentType === "GS1";
    return { texto: esGs1 && r.symbologyIdentifier ? `${r.symbologyIdentifier}${r.text}` : r.text, formato: r.format };
  };

  let lienzo: HTMLCanvasElement | null = null;
  return {
    motor: "zxing",
    leerImagen,
    leer: async (video) => {
      const ancho = video.videoWidth;
      const alto = video.videoHeight;
      if (!ancho || !alto) return null;
      const escala = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto));
      lienzo ??= document.createElement("canvas");
      lienzo.width = Math.round(ancho * escala);
      lienzo.height = Math.round(alto * escala);
      const contexto = lienzo.getContext("2d", { willReadFrequently: true });
      if (!contexto) return null;
      contexto.drawImage(video, 0, 0, lienzo.width, lienzo.height);
      return leerImagen(contexto.getImageData(0, 0, lienzo.width, lienzo.height));
    },
  };
}

let lectorCompartido: Promise<Lector> | null = null;

/** Lector listo para usar (se crea una vez y se reutiliza). */
export function obtenerLector(): Promise<Lector> {
  lectorCompartido ??= (async () => (await lectorNativo()) ?? (await lectorZxing()))().catch((error: unknown) => {
    lectorCompartido = null; // un fallo de red al traer el .wasm no debe quedar pegado
    throw error;
  });
  return lectorCompartido;
}
