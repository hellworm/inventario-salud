import type * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BellRing,
  Boxes,
  CalendarCog,
  ChevronDown,
  History,
  LifeBuoy,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { BadgeRol, Card, CardHeader, PageHeader } from "@/components/ui";
import { NOMBRE_ROL, puede, type Permiso, type Rol } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Ayuda" };

const QUE_PUEDE: Record<Rol, { resumen: string; puntos: string[] }> = {
  VISITANTE: {
    resumen: "Consultas el inventario y las alertas de tus centros. No registras ni modificas nada.",
    puntos: [
      "Ver el resumen del día en el Panel.",
      "Buscar insumos y revisar sus lotes, ubicaciones y vencimientos en Inventario.",
      "Revisar qué falta o está por vencer en Alertas, e imprimir la lista de reposición.",
    ],
  },
  BODEGUERO: {
    resumen: "Además de consultar, registras lo que entra y lo que sale en tus centros y ves el historial.",
    puntos: [
      "Todo lo de un visitante: Panel, Inventario y Alertas.",
      "Registrar ingresos (llegan insumos) y retiros (salen para su uso).",
      "Revisar el historial de movimientos de tus centros.",
      "Los traslados, ajustes y mermas los hace un administrador.",
    ],
  },
  ADMIN: {
    resumen: "Tienes acceso completo a tu institución: todos sus centros, usuarios y reportes. No ves nada de otras instituciones.",
    puntos: [
      "Todo lo de un bodeguero, en cualquier centro de tu institución o en “Toda mi institución”.",
      "Trasladar stock entre ubicaciones o centros de tu institución, corregirlo con ajustes y dar de baja mermas.",
      "Corregir la fecha de vencimiento de un lote que se digitó mal.",
      "Ver reportes y descargarlos para Excel.",
      "Administrar los centros, ubicaciones y usuarios de tu institución, los proveedores, y revisar la auditoría de tu institución.",
      "Crear insumos nuevos y definir los mínimos y máximos de tus centros. Los insumos y categorías que ya existen son compartidos por toda la red: para modificarlos contacta al administrador de la red.",
    ],
  },
  ADMIN_RED: {
    resumen: "Administras la plataforma: tienes acceso completo a toda la red, con todas sus instituciones.",
    puntos: [
      "Todo lo de un administrador de institución, en cualquier centro o en “Toda la red”.",
      "Crear instituciones y a su primer administrador; desactivar las que dejan de operar.",
      "Ver en el Panel el resumen de toda la red por institución.",
      "Editar, desactivar o eliminar insumos y categorías del catálogo compartido.",
      "Administrar centros y usuarios de cualquier institución, y revisar la auditoría de toda la red.",
    ],
  },
};

interface Tarea {
  id: string;
  titulo: string;
  icono: LucideIcon;
  permiso: Permiso;
  enlace: { href: string; texto: string };
  pasos: React.ReactNode[];
  notas?: string[];
}

const TAREAS: Tarea[] = [
  {
    id: "buscar",
    titulo: "Buscar un insumo y ver dónde está",
    icono: Boxes,
    permiso: "inventario:ver",
    enlace: { href: "/inventario", texto: "Ir a Inventario" },
    pasos: [
      <>Entra a <strong>Inventario</strong> y escribe el nombre, el código o el número de lote.</>,
      <>Si quieres, filtra por categoría o ubicación, o usa los botones <strong>Sin stock</strong>, <strong>Bajo mínimo</strong>, <strong>Por vencer</strong> o <strong>Vencidos</strong>.</>,
      <>Toca un insumo: verás cuánto hay, en qué ubicación está cada lote y cuándo vence. <strong>Ver ficha completa</strong> muestra todo el detalle.</>,
    ],
  },
  {
    id: "alertas",
    titulo: "Ver qué falta o está por vencer",
    icono: BellRing,
    permiso: "alertas:ver",
    enlace: { href: "/alertas", texto: "Ir a Alertas" },
    pasos: [
      <>En <strong>Alertas</strong> hay cuatro pestañas: <strong>Sin stock</strong>, <strong>Bajo mínimo</strong>, <strong>Vencidos</strong> y <strong>Por vencer</strong>.</>,
      <>Cada fila trae la acción que tu rol puede hacer: <strong>Ingresar</strong> lo que falta, <strong>Retirar</strong> primero el lote que está por vencer o <strong>Dar de baja</strong> un lote vencido. Abren el formulario con el insumo, la ubicación y el lote ya elegidos.</>,
      <>El botón <strong>Lista de reposición</strong> arma el listado de lo que conviene pedir. Puedes imprimirlo o descargarlo para Excel.</>,
    ],
    notas: ["El Panel muestra un resumen de lo mismo, en orden de prioridad, con las mismas acciones."],
  },
  {
    id: "ingreso",
    titulo: "Registrar un ingreso (llegan insumos)",
    icono: ArrowDownToLine,
    permiso: "movimientos:ingreso",
    enlace: { href: "/movimientos/ingreso", texto: "Registrar ingreso" },
    pasos: [
      <>Menú <strong>Registrar → Ingreso</strong>.</>,
      <>Busca el <strong>insumo</strong> por nombre o código y elige la <strong>ubicación de destino</strong>.</>,
      <>Copia el <strong>número de lote</strong> y el <strong>vencimiento</strong> tal como vienen en el envase. Si el lote ya existe, tócalo en las sugerencias.</>,
      <>Escribe la <strong>cantidad</strong>. Recomendado: indica el proveedor y la guía o factura.</>,
      <>Si anotas el <strong>costo unitario</strong>, usa coma para los decimales (1250,5); el punto separa miles (1.250). Bajo el campo verás el monto tal como se guardará.</>,
      <>Revisa el resumen al pie (“Vas a ingresar…”) y presiona <strong>Registrar ingreso</strong>.</>,
    ],
    notas: [
      "No se pueden ingresar lotes ya vencidos.",
      "Si el insumo controla vencimiento, la fecha es obligatoria.",
      "En las notas no incluyas datos de pacientes.",
    ],
  },
  {
    id: "retiro",
    titulo: "Registrar un retiro (salen insumos para su uso)",
    icono: ArrowUpFromLine,
    permiso: "movimientos:retiro",
    enlace: { href: "/movimientos/retiro", texto: "Registrar retiro" },
    pasos: [
      <>Menú <strong>Registrar → Retiro</strong>.</>,
      <>Elige el <strong>insumo</strong> (al abrir el buscador aparecen primero los <strong>más usados en este centro</strong>) y <strong>desde qué ubicación</strong> lo sacas. Verás cuánto hay disponible ahí.</>,
      <>Deja <strong>Automático</strong> para que salga primero lo que vence antes (toma físicamente esos mismos lotes), o usa <strong>Elegir lote</strong>.</>,
      <>Escribe la <strong>cantidad</strong> y, si quieres, el destino o motivo.</>,
      <>Presiona <strong>Registrar retiro</strong>. Si retiras más de la mitad de lo disponible, el sistema te pide confirmar.</>,
    ],
    notas: ["No se puede retirar más de lo disponible.", "Los lotes vencidos no se retiran: un administrador debe darlos de baja."],
  },
  {
    id: "historial",
    titulo: "Revisar lo registrado",
    icono: History,
    permiso: "movimientos:ver",
    enlace: { href: "/movimientos", texto: "Ir al historial" },
    pasos: [
      <>En <strong>Movimientos</strong> está todo lo que entró y salió, con fecha, usuario, lote y cantidad.</>,
      <>Filtra por tipo, fechas, ubicación, usuario o insumo y toca un movimiento para ver su detalle.</>,
    ],
    notas: ["Los movimientos no se editan ni se borran. Si hay un error, un administrador lo corrige con un ajuste."],
  },
  {
    id: "traslado",
    titulo: "Trasladar insumos",
    icono: ArrowLeftRight,
    permiso: "movimientos:traslado",
    enlace: { href: "/movimientos/traslado", texto: "Registrar traslado" },
    pasos: [
      <>Menú <strong>Registrar → Traslado</strong>.</>,
      <>Elige el insumo, la ubicación de <strong>origen</strong>, el lote, la de <strong>destino</strong> (puede ser de otro centro) y la cantidad.</>,
      <>El sistema registra la salida y la entrada juntas.</>,
    ],
  },
  {
    id: "ajuste",
    titulo: "Corregir el stock o dar de baja",
    icono: SlidersHorizontal,
    permiso: "movimientos:ajuste",
    enlace: { href: "/movimientos/ajuste", texto: "Ajuste o merma" },
    pasos: [
      <>Menú <strong>Registrar → Ajuste o merma</strong>.</>,
      <>Elige <strong>Sumar stock</strong> (hay más de lo registrado), <strong>Restar stock</strong> (hay menos) o <strong>Dar de baja</strong> (vencido, dañado o perdido).</>,
      <>Indica insumo, ubicación, lote, cantidad y el <strong>motivo</strong>.</>,
      <>El sistema muestra un resumen y pide <strong>confirmar</strong>: un ajuste o una merma no se pueden editar ni borrar después.</>,
    ],
    notas: ["Dar de baja es la única forma de sacar del inventario un lote vencido.", "Todo ajuste queda en el historial y en la auditoría con tu nombre."],
  },
  {
    id: "vencimiento",
    titulo: "Corregir el vencimiento de un lote",
    icono: CalendarCog,
    permiso: "movimientos:ajuste",
    enlace: { href: "/inventario", texto: "Ir a Inventario" },
    pasos: [
      <>Abre la <strong>ficha completa</strong> del insumo desde Inventario.</>,
      <>En la tabla <strong>Existencias por lote y ubicación</strong>, usa <strong>Corregir vencimiento</strong> en el lote.</>,
      <>Indica la <strong>fecha correcta</strong> y el <strong>motivo</strong>, revisa el antes y el después y confirma.</>,
    ],
    notas: [
      "Úsalo solo si la fecha se digitó mal: cambia el lote en todas las ubicaciones y centros.",
      "Si el lote también tiene existencias en otra institución, solo puede corregirlo el administrador de la red.",
      "Queda en la auditoría con tu nombre, la fecha anterior, la nueva y el motivo.",
    ],
  },
];

const PREGUNTAS: { pregunta: string; respuesta: string }[] = [
  {
    pregunta: "Olvidé mi contraseña.",
    respuesta:
      "Pide a un administrador que la restablezca: te dará una contraseña temporal, que debes usar dentro de 72 horas (después vence y hay que pedir otra). No hay recuperación por correo.",
  },
  {
    pregunta: "Me aparece “Tu sesión venció”.",
    respuesta:
      "La sesión se cierra sola tras varias horas sin uso. Vuelve a ingresar: el sistema te devuelve a la pantalla donde estabas, pero tendrás que escribir de nuevo lo que no alcanzaste a registrar.",
  },
  {
    pregunta: "¿Puedo instalarlo en la tablet o el teléfono?",
    respuesta:
      "Sí. En Chrome o Edge abre el menú del navegador y elige “Instalar aplicación” o “Agregar a la pantalla principal”; en iPad o iPhone, en Safari, toca Compartir y luego “Agregar a inicio”. Queda con su ícono y se abre a pantalla completa. Necesita conexión: no funciona sin internet.",
  },
  {
    pregunta: "Dice que no tengo un centro activo asignado.",
    respuesta: "Tu cuenta no está asignada a ningún centro en funcionamiento. Pide a un administrador que te asigne uno.",
  },
  {
    pregunta: "Registré mal un movimiento.",
    respuesta: "No se puede editar ni borrar. Un administrador lo corrige con un ajuste, indicando el motivo.",
  },
  {
    pregunta: "El sistema dice que hay stock, pero no lo encuentro.",
    respuesta: "Revisa en la ficha del insumo en qué ubicación y lote figura. Si realmente no está, avisa a un administrador para que lo ajuste.",
  },
  {
    pregunta: "No veo un centro o un botón que otra persona sí ve.",
    respuesta: "Depende del rol, de la institución y de los centros asignados a cada persona. Consulta a un administrador.",
  },
  {
    pregunta: "¿Se guardan datos de pacientes?",
    respuesta: "No. No escribas nombres, RUT ni datos de pacientes en las notas o motivos.",
  },
];

export default async function PaginaAyuda() {
  const { actor } = await contextoPagina("panel:ver");
  const rol = actor.rol;
  const tareas = TAREAS.filter((t) => puede(rol, t.permiso));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader titulo="Ayuda" descripcion="Primeros pasos para el trabajo diario, según lo que tu rol puede hacer." />

      <Card className="mb-4">
        <CardHeader titulo="Tu rol" acciones={<BadgeRol rol={rol} />} />
        <p className="text-[0.9375rem] text-texto">{QUE_PUEDE[rol].resumen}</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[0.9375rem] text-texto-suave marker:text-marca-600">
          {QUE_PUEDE[rol].puntos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-4 border-t border-borde pt-3 text-sm text-texto-suave">
          Tu rol ({NOMBRE_ROL[rol]}) aparece bajo tu nombre, arriba a la derecha. Ahí mismo puedes cambiar tu contraseña y salir. Con el
          selector de centro, arriba a la izquierda, eliges qué centro estás viendo.
        </p>
      </Card>

      <h2 className="mt-8 mb-3 text-lg font-semibold tracking-tight text-texto">Cómo se hace</h2>
      <div className="space-y-3">
        {tareas.map((t, i) => (
          <details key={t.id} open={i === 0} className="group rounded-tarjeta border border-borde bg-superficie shadow-tarjeta">
            <summary className="flex min-h-14 list-none items-center gap-3 rounded-tarjeta px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-700">
                <t.icono className="size-[1.125rem]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold text-texto">{t.titulo}</span>
              <ChevronDown className="size-5 shrink-0 text-texto-suave transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-borde px-4 py-4 sm:px-5">
              <ol className="list-decimal space-y-2 pl-5 text-[0.9375rem] text-texto marker:font-semibold marker:text-marca-700">
                {t.pasos.map((paso, n) => (
                  <li key={n}>{paso}</li>
                ))}
              </ol>
              {t.notas ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-texto-suave">
                  {t.notas.map((nota) => (
                    <li key={nota}>{nota}</li>
                  ))}
                </ul>
              ) : null}
              <Link
                href={t.enlace.href}
                className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-md text-[0.9375rem] font-semibold text-marca-700 underline-offset-4 hover:underline"
              >
                {t.enlace.texto} →
              </Link>
            </div>
          </details>
        ))}
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold tracking-tight text-texto">Preguntas frecuentes</h2>
      <Card>
        <dl className="-my-3 divide-y divide-borde">
          {PREGUNTAS.map((p) => (
            <div key={p.pregunta} className="py-3">
              <dt className="text-[0.9375rem] font-semibold text-texto">{p.pregunta}</dt>
              <dd className="mt-0.5 text-[0.9375rem] text-texto-suave">{p.respuesta}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <section aria-labelledby="titulo-contacto" className="mt-6 flex gap-3.5 rounded-tarjeta border border-marca-200 bg-marca-50 p-4 sm:p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-superficie text-marca-700 ring-1 ring-marca-200 ring-inset">
          <LifeBuoy className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="titulo-contacto" className="text-base font-semibold text-marca-900">
            ¿Necesitas ayuda?
          </h2>
          <p className="mt-1 text-[0.9375rem] text-texto">
            Habla con el administrador de tu institución: puede restablecer tu contraseña, desbloquear tu cuenta, cambiar tu rol o tus centros
            y corregir movimientos mal registrados. Si el sistema muestra un error, anota qué estabas haciendo y el código que aparece en
            pantalla.
          </p>
        </div>
      </section>
    </div>
  );
}
