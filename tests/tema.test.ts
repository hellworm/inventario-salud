import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COLOR_BARRA, COOKIE_TEMA, atributoTema, cookieTema, leerTema } from "@/lib/tema";

/**
 * Temas claro y oscuro: la preferencia (cookie → atributo) y, sobre todo, el
 * CONTRASTE de los tokens de `globals.css`, medido con la fórmula de WCAG 2.x
 * (luminancia relativa). Texto normal ≥ 4,5:1; elementos gráficos (íconos del
 * semáforo, bordes de selección, foco, barras) ≥ 3:1. En los dos temas.
 */

const CSS = fs.readFileSync(path.resolve(import.meta.dirname, "../src/app/globals.css"), "utf8");

/** Declaraciones `--nombre: valor;` del bloque que empieza en `cabecera`. */
function bloque(cabecera: string): Map<string, string> {
  const inicio = CSS.indexOf(cabecera);
  if (inicio < 0) throw new Error(`No se encontró el bloque "${cabecera}" en globals.css`);
  let nivel = 0;
  let fin = inicio;
  for (let i = CSS.indexOf("{", inicio); i < CSS.length; i += 1) {
    if (CSS[i] === "{") nivel += 1;
    if (CSS[i] === "}") {
      nivel -= 1;
      if (nivel === 0) {
        fin = i;
        break;
      }
    }
  }
  const variables = new Map<string, string>();
  for (const m of CSS.slice(inicio, fin).matchAll(/(--[\w-]+):\s*([^;]+);/g)) variables.set(m[1]!, m[2]!.trim());
  return variables;
}

const claro = new Map([...bloque("@theme {"), ...bloque(":root {")]);
const oscuro = new Map([...claro, ...bloque("@utility ri-tema-oscuro {")]);
const TEMAS = { claro, oscuro } as const;
type NombreTema = keyof typeof TEMAS;

/** Color `#rrggbb` de un token (`fondo`, `marca-700`, `primario`…), resolviendo `var()`. */
function color(tema: NombreTema, token: string): string {
  if (token.startsWith("#")) return token;
  let valor = TEMAS[tema].get(`--color-${token}`) ?? TEMAS[tema].get(`--ri-${token}`);
  for (let i = 0; valor && i < 5; i += 1) {
    const ref = valor.match(/^var\((--[\w-]+)\)$/);
    if (!ref) break;
    valor = TEMAS[tema].get(ref[1]!);
  }
  if (!valor || !/^#[0-9a-f]{6}$/i.test(valor)) throw new Error(`Token sin color hexadecimal en ${tema}: ${token} → ${valor}`);
  return valor;
}

function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

function contraste(tema: NombreTema, a: string, b: string): number {
  const [x, y] = [luminancia(color(tema, a)), luminancia(color(tema, b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const SUPERFICIES = ["fondo", "superficie", "superficie-2", "superficie-alta"] as const;
const BLANCO = "#ffffff";

/** [texto, fondo] que deben cumplir 4,5:1 en ambos temas. */
const PARES_TEXTO: [string, string][] = [
  // Texto base sobre cada nivel de superficie y sobre el realce de la marca.
  ...[...SUPERFICIES, "marca-50"].flatMap((s): [string, string][] => [
    ["texto", s],
    ["texto-suave", s],
    ["texto-tenue", s],
    ["marca-700", s],
    ["marca-800", s],
  ]),
  // Badges y alertas (tono → texto 800 sobre fondo 50).
  ["exito-800", "exito-50"],
  ["alerta-800", "alerta-50"],
  ["peligro-800", "peligro-50"],
  ["info-800", "info-50"],
  ["marca-800", "marca-50"],
  ["marca-900", "marca-50"],
  ["texto-suave", "superficie-2"],
  // SEMÁFORO DE VENCIMIENTO: badge e ícono en recuadro de cada estado.
  [BLANCO, "vencido"], // Vencido (sólido)
  ["peligro-800", "peligro-50"], // Rojo
  ["peligro-700", "peligro-50"],
  ["alerta-800", "alerta-50"], // Amarillo
  ["alerta-800", "alerta-100"],
  ["exito-800", "exito-50"], // Verde
  ["exito-700", "exito-50"],
  ["texto-suave", "superficie-2"], // Sin vencimiento
  // Textos de estado sueltos sobre las superficies.
  ...(["superficie", "superficie-alta", "fondo"] as const).flatMap((s): [string, string][] => [
    ["peligro-700", s],
    ["peligro-800", s],
    ["exito-700", s],
    ["alerta-700", s],
    ["alerta-800", s],
    ["info-700", s],
  ]),
  // Rellenos sólidos con texto blanco.
  [BLANCO, "primario"],
  [BLANCO, "primario-hover"],
  [BLANCO, "primario-activo"],
  [BLANCO, "critico"],
  [BLANCO, "critico-hover"],
  [BLANCO, "critico-activo"],
  [BLANCO, "noche-900"],
  [BLANCO, "noche-950"],
  ["sobre-pista", "pista"],
];

/** [gráfico, fondo] que deben cumplir 3:1 en ambos temas. */
const PARES_GRAFICOS: [string, string][] = [
  ...(["superficie", "superficie-alta", "fondo"] as const).flatMap((s): [string, string][] => [
    // Íconos del semáforo (forma + color) y de estado.
    ["peligro-800", s],
    ["peligro-700", s],
    ["peligro-600", s],
    ["alerta-700", s],
    ["exito-700", s],
    ["exito-600", s],
    ["vencido", s],
    // Bordes de selección, foco y series del gráfico.
    ["marca-600", s],
    ["foco", s],
    ["marca-500", s],
    ["serie-salidas", s],
    ["primario", s],
  ]),
];

describe("tema · contraste de los tokens (WCAG)", () => {
  for (const tema of ["claro", "oscuro"] as const) {
    it(`texto ≥ 4,5:1 en tema ${tema}`, () => {
      const fallas = PARES_TEXTO.map(([a, b]) => ({ par: `${a} sobre ${b}`, ratio: contraste(tema, a, b) }))
        .filter((p) => p.ratio < 4.5)
        .map((p) => `${p.par}: ${p.ratio.toFixed(2)}`);
      expect(fallas).toEqual([]);
    });

    it(`elementos gráficos ≥ 3:1 en tema ${tema}`, () => {
      const fallas = PARES_GRAFICOS.map(([a, b]) => ({ par: `${a} sobre ${b}`, ratio: contraste(tema, a, b) }))
        .filter((p) => p.ratio < 3)
        .map((p) => `${p.par}: ${p.ratio.toFixed(2)}`);
      expect(fallas).toEqual([]);
    });
  }

  it("en oscuro las barras de alerta y los bordes de control también alcanzan 3:1", () => {
    for (const s of ["superficie", "superficie-alta", "fondo"]) {
      expect(contraste("oscuro", "alerta-500", s)).toBeGreaterThanOrEqual(3);
      expect(contraste("oscuro", "borde-fuerte", s)).toBeGreaterThanOrEqual(3);
    }
  });

  it("el tema oscuro redefine todas las escalas de color y los tokens semánticos", () => {
    const definidos = bloque("@utility ri-tema-oscuro {");
    const escalas = [...bloque("@theme {").keys()].filter((v) => /^--color-(marca|exito|alerta|peligro|info)-\d+$/.test(v));
    const semanticos = [...bloque(":root {").keys()];
    expect(escalas.length).toBeGreaterThan(25);
    expect([...escalas, ...semanticos].filter((v) => !definidos.has(v))).toEqual([]);
    expect(CSS).toMatch(/@utility ri-tema-oscuro \{[^}]*color-scheme: dark;/);
  });

  it("los niveles de elevación del tema oscuro van de más oscuro a más claro", () => {
    const niveles = ["fondo", "superficie", "superficie-alta", "superficie-2"].map((t) => luminancia(color("oscuro", t)));
    expect([...niveles].sort((a, b) => a - b)).toEqual(niveles);
    expect(luminancia(color("oscuro", "fondo"))).toBeLessThan(0.01);
  });

  it("el tema oscuro solo se aplica en pantalla (la impresión queda en claro) y sin script", () => {
    expect(CSS).toMatch(/@media screen \{\s*:root\[data-tema="oscuro"\] \{\s*@apply ri-tema-oscuro;/);
    expect(CSS).toMatch(/@media screen and \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-tema\]\) \{\s*@apply ri-tema-oscuro;/);
    // Ninguna otra regla aplica el tema oscuro (p. ej. fuera de `screen`).
    expect(CSS.match(/@apply ri-tema-oscuro/g)).toHaveLength(2);
  });

  it("el color de la barra del navegador coincide con los tokens", () => {
    expect(COLOR_BARRA.claro).toBe(color("claro", "primario"));
    expect(COLOR_BARRA.oscuro).toBe(color("oscuro", "superficie"));
  });
});

describe("tema · preferencia", () => {
  it("solo acepta 'claro' u 'oscuro'; cualquier otro valor es 'sistema'", () => {
    expect(leerTema("claro")).toBe("claro");
    expect(leerTema("oscuro")).toBe("oscuro");
    for (const valor of [undefined, null, "", "sistema", "OSCURO", "dark", '"><script>alert(1)</script>']) {
      expect(leerTema(valor)).toBe("sistema");
    }
    expect(atributoTema("sistema")).toBeUndefined();
    expect(atributoTema("oscuro")).toBe("oscuro");
  });

  it("la cookie dura un año, es SameSite=Lax y 'sistema' la borra", () => {
    expect(cookieTema("oscuro", false)).toBe(`${COOKIE_TEMA}=oscuro; Path=/; Max-Age=31536000; SameSite=Lax`);
    expect(cookieTema("claro", true)).toBe(`${COOKIE_TEMA}=claro; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
    expect(cookieTema("sistema", false)).toBe(`${COOKIE_TEMA}=; Path=/; Max-Age=0; SameSite=Lax`);
  });
});
