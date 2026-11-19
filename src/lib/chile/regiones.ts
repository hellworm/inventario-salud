/** Regiones de Chile (de norte a sur) con sus comunas principales. */

export interface Region {
  codigo: string;
  nombre: string;
  /** Comunas más pobladas / capitales. No es la lista exhaustiva. */
  comunas: readonly string[];
}

export const REGIONES: readonly Region[] = [
  { codigo: "AP", nombre: "Arica y Parinacota", comunas: ["Arica", "Putre", "Camarones", "General Lagos"] },
  { codigo: "TA", nombre: "Tarapacá", comunas: ["Iquique", "Alto Hospicio", "Pozo Almonte", "Pica", "Huara"] },
  { codigo: "AN", nombre: "Antofagasta", comunas: ["Antofagasta", "Calama", "Tocopilla", "Mejillones", "Taltal", "San Pedro de Atacama"] },
  { codigo: "AT", nombre: "Atacama", comunas: ["Copiapó", "Vallenar", "Caldera", "Chañaral", "Tierra Amarilla", "Huasco"] },
  { codigo: "CO", nombre: "Coquimbo", comunas: ["La Serena", "Coquimbo", "Ovalle", "Illapel", "Vicuña", "Salamanca", "Los Vilos"] },
  { codigo: "VA", nombre: "Valparaíso", comunas: ["Valparaíso", "Viña del Mar", "Quilpué", "Villa Alemana", "San Antonio", "Quillota", "Los Andes", "San Felipe", "Concón", "La Calera", "Limache", "Casablanca"] },
  { codigo: "RM", nombre: "Metropolitana de Santiago", comunas: ["Santiago", "Puente Alto", "Maipú", "La Florida", "Las Condes", "Ñuñoa", "Providencia", "San Bernardo", "Peñalolén", "Pudahuel", "Quilicura", "La Pintana", "El Bosque", "Recoleta", "Estación Central", "Independencia", "Macul", "San Miguel", "La Reina", "Vitacura", "Lo Barnechea", "Cerro Navia", "Renca", "Conchalí", "Huechuraba", "La Cisterna", "La Granja", "Lo Espejo", "Lo Prado", "Pedro Aguirre Cerda", "Quinta Normal", "San Joaquín", "San Ramón", "Cerrillos", "Colina", "Melipilla", "Talagante", "Buin", "Peñaflor", "Lampa"] },
  { codigo: "LI", nombre: "Libertador General Bernardo O'Higgins", comunas: ["Rancagua", "San Fernando", "Rengo", "Machalí", "Santa Cruz", "Pichilemu", "Graneros", "San Vicente"] },
  { codigo: "ML", nombre: "Maule", comunas: ["Talca", "Curicó", "Linares", "Constitución", "Cauquenes", "Molina", "Parral", "San Javier"] },
  { codigo: "NB", nombre: "Ñuble", comunas: ["Chillán", "Chillán Viejo", "San Carlos", "Bulnes", "Quirihue", "Yungay"] },
  { codigo: "BI", nombre: "Biobío", comunas: ["Concepción", "Talcahuano", "Los Ángeles", "Coronel", "San Pedro de la Paz", "Chiguayante", "Hualpén", "Lota", "Tomé", "Penco", "Lebu", "Arauco", "Cañete"] },
  { codigo: "AR", nombre: "La Araucanía", comunas: ["Temuco", "Padre Las Casas", "Angol", "Villarrica", "Pucón", "Victoria", "Lautaro", "Nueva Imperial"] },
  { codigo: "LR", nombre: "Los Ríos", comunas: ["Valdivia", "La Unión", "Río Bueno", "Panguipulli", "Paillaco", "Lanco"] },
  { codigo: "LL", nombre: "Los Lagos", comunas: ["Puerto Montt", "Osorno", "Castro", "Ancud", "Puerto Varas", "Quellón", "Calbuco", "Frutillar"] },
  { codigo: "AI", nombre: "Aysén del General Carlos Ibáñez del Campo", comunas: ["Coyhaique", "Puerto Aysén", "Chile Chico", "Cochrane"] },
  { codigo: "MA", nombre: "Magallanes y de la Antártica Chilena", comunas: ["Punta Arenas", "Puerto Natales", "Porvenir", "Cabo de Hornos"] },
];

export const NOMBRES_REGIONES: readonly string[] = REGIONES.map((r) => r.nombre);

export function comunasDeRegion(nombreRegion: string): readonly string[] {
  return REGIONES.find((r) => r.nombre === nombreRegion)?.comunas ?? [];
}
