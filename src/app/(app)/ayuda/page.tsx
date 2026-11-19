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
  ScanBarcode,
  SlidersHorizontal,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { BadgeEstadoVencimiento, BadgeRol, Card, CardHeader, PageHeader } from "@/components/ui";
import { DESCRIPCION_SEMAFORO, type EstadoVencimiento } from "@/lib/estados";
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
      "Ver los proveedores, con su teléfono, su correo y su sitio web para comprar.",
    ],
  },
  BODEGUERO: {
    resumen: "Además de consultar, registras lo que entra y lo que sale en tus centros y ves el historial.",
    puntos: [
      "Todo lo de un visitante: Panel, Inventario y Alertas.",
      "Registrar ingresos (llegan insumos) y retiros (salen para su uso), también escaneando el código del envase con la cámara.",
      "Revisar el historial de movimientos de tus centros.",
      "Los traslados, ajustes y mermas los hace un administrador.",
    ],
  },
  ADMIN: {
    resumen: "Tienes acceso completo a tu institución: todos sus centros, usuarios y reportes. No ves nada de otras instituciones.",
    puntos: [
      "Todo lo de un bodeguero (incluido escanear para ingresar), en cualquier centro de tu institución o en “Toda mi institución”.",
      "Trasladar stock entre ubicaciones o centros de tu institución, corregirlo con ajustes y dar de baja mermas.",
      "Corregir la fecha de vencimiento de un lote que se digitó mal.",
      "Ver reportes y descargarlos para Excel.",
      "Administrar los centros, ubicaciones y usuarios de tu institución, los proveedores, y revisar la auditoría de tu institución.",
      "Crear insumos nuevos (también desde el escáner, con el código leído) y definir los mínimos y máximos de tus centros. Los insumos y categorías que ya existen son compartidos por toda la red: para modificarlos o asociarles un código de barras contacta al administrador de la red.",
    ],
  },
  ADMIN_RED: {
    resumen: "Administras la plataforma: tienes acceso completo a toda la red, con todas sus instituciones.",
    puntos: [
      "Todo lo de un administrador de institución, en cualquier centro o en “Toda la red”.",
      "Crear instituciones y a su primer administrador; desactivar las que dejan de operar.",
      "Ver en el Panel el resumen de toda la red por institución: qué falta y el semáforo de vencimientos de cada una y de cada centro.",
      "Editar, desactivar o eliminar insumos y categorías del catálogo compartido, y asociar un código de barras escaneado a un insumo que ya existe.",
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
      <>Si quieres, filtra por categoría o ubicación, o usa los botones <strong>Sin stock</strong>, <strong>Bajo mínimo</strong> y los del semáforo de vencimiento: <strong>Rojo</strong>, <strong>Amarillo</strong>, <strong>Verde</strong> o <strong>Vencidos</strong>.</>,
      <>Toca un insumo: verás cuánto hay, en qué ubicación está cada lote, cuándo vence y de qué color es. <strong>Ver ficha completa</strong> muestra todo el detalle.</>,
    ],
    notas: ["El color de un insumo es el de su lote con stock que vence antes; al lado se ve cuántos lotes tiene de cada color."],
  },
  {
    id: "alertas",
    titulo: "Ver qué falta o está por vencer",
    icono: BellRing,
    permiso: "alertas:ver",
    enlace: { href: "/alertas", texto: "Ir a Alertas" },
    pasos: [
      <>En <strong>Alertas</strong> hay cinco pestañas: <strong>Sin stock</strong>, <strong>Bajo mínimo</strong>, <strong>Vencidos</strong>, <strong>Rojo</strong> (vence en menos de 3 meses) y <strong>Amarillo</strong> (vence en 3 a 6 meses).</>,
      <>Cada fila trae la acción que tu rol puede hacer: <strong>Ingresar</strong> lo que falta, <strong>Retirar</strong> primero el lote en rojo o amarillo o <strong>Dar de baja</strong> un lote vencido. Abren el formulario con el insumo, la ubicación y el lote ya elegidos.</>,
      <>El botón <strong>Lista de reposición</strong> arma el listado de lo que conviene pedir. Puedes imprimirlo o descargarlo para Excel.</>,
    ],
    notas: [
      "El Panel muestra el semáforo de vencimientos (toca un color para ver sus insumos) y la lista de productos en rojo.",
      "Lo que está en verde no es una alerta: lo ves en Inventario con el filtro Verde.",
    ],
  },
  {
    id: "escanear",
    titulo: "Ingresar un producto escaneando su código",
    icono: ScanBarcode,
    permiso: "movimientos:ingreso",
    enlace: { href: "/movimientos/escanear", texto: "Escanear para ingresar" },
    pasos: [
      <>En el celular, toca <strong>Escanear</strong> en el Panel o en la barra de abajo. La primera vez el navegador pedirá permiso para usar la cámara: acéptalo.</>,
      <>Apunta al <strong>código de barras</strong> o al <strong>cuadrado pequeño (DataMatrix)</strong> del envase. Si hay poca luz, enciende la <strong>linterna</strong>.</>,
      <>Si el sistema reconoce el código, abre el ingreso con el insumo ya elegido. Cuando el código trae el <strong>lote</strong> y el <strong>vencimiento</strong>, también quedan completos: revísalos contra el envase.</>,
      <>Escribe la <strong>cantidad</strong> y presiona <strong>Registrar ingreso</strong>.</>,
    ],
    notas: [
      "¿La cámara no lee? Usa «Escribir el código» y copia los números que aparecen bajo las barras. También sirve un lector de códigos conectado al computador.",
      "Si aparece «No reconocemos este código», busca el insumo por su nombre y continúa: no se pierde el lote ni el vencimiento leídos. El administrador de la red puede asociar el código a un insumo que ya existe para que la próxima vez se reconozca; si el insumo aún no existe, un administrador de institución puede crearlo con ese código.",
      "Si negaste el permiso de la cámara, actívalo desde el candado junto a la dirección del sitio (en iPhone, «aA») y vuelve a intentarlo.",
      "Dentro de los formularios de ingreso y de retiro también hay un botón Escanear junto al buscador de insumos.",
    ],
  },
  {
    id: "proveedores",
    titulo: "Ver los proveedores y dónde comprar",
    icono: Truck,
    permiso: "proveedores:ver",
    enlace: { href: "/proveedores", texto: "Ver proveedores" },
    pasos: [
      <>En el <strong>Panel</strong>, la sección <strong>Proveedores</strong> muestra primero los que más has usado al registrar ingresos.</>,
      <><strong>Ir a comprar</strong> abre el sitio web del proveedor en otra pestaña (verás su dirección bajo el nombre).</>,
      <>Toca el nombre de un proveedor para desplegar su <strong>teléfono</strong>, su <strong>correo</strong>, la persona de contacto y el RUT. Desde el celular, tocar el teléfono inicia la llamada.</>,
    ],
    notas: [
      "Los proveedores son compartidos por toda la red. Los administradores (de la red o de una institución) los mantienen, incluido el sitio web, en Administración › Proveedores.",
      "Cada insumo tiene su proveedor: lo ves en la grilla del Inventario (y puedes filtrar por él), en la ficha del insumo, en las alertas de stock y en la lista de reposición, con el botón «Ir a comprar» cuando el proveedor tiene sitio web.",
      "Al desplegar un proveedor, «Insumos que le compras» abre el inventario filtrado por ese proveedor.",
    ],
  },
  {
    id: "proveedor-insumo",
    titulo: "Definir o cambiar el proveedor de un insumo",
    icono: Truck,
    permiso: "proveedores-insumo:gestionar",
    enlace: { href: "/inventario", texto: "Ir al inventario" },
    pasos: [
      <>Abre la <strong>ficha del insumo</strong> (Inventario → el insumo → <strong>Ver ficha completa</strong>). La tarjeta <strong>Proveedor</strong> muestra a quién se le compra, con su teléfono, su correo y el botón <strong>Ir a comprar</strong>.</>,
      <>Presiona <strong>Cambiar proveedor</strong> (o <strong>Definir proveedor</strong> si aún no tiene) y elige uno de la lista; puedes buscarlo por nombre o RUT.</>,
      <>Fíjate en el recuadro que dice <strong>qué estás cambiando</strong>: «para tu institución» (solo cambia para la tuya) o «el predeterminado de la red» (lo define el administrador de la red y vale para todas las instituciones que no tengan uno propio).</>,
      <>Presiona <strong>Continuar</strong>, revisa el resumen «Hoy / Quedará» y <strong>Confirmar cambio</strong>.</>,
      <>Para dejar de usar un proveedor propio, en el mismo diálogo elige <strong>Volver al predeterminado de la red</strong>.</>,
    ],
    notas: [
      "El proveedor de un insumo se preselecciona al registrar un ingreso. Si un ingreso se registra con otro proveedor, el predeterminado NO cambia.",
      "Si el insumo no tiene proveedor, la ficha muestra el del último ingreso como sugerencia («Último proveedor»), con «Usar como predeterminado».",
      "Un proveedor desactivado no se puede elegir. Si un insumo lo tenía asignado, se muestra marcado «Inactivo» hasta que lo cambies.",
      "También puedes hacerlo en Administración › Insumos: el administrador de la red, en el campo «Proveedor predeterminado»; el administrador de institución, en la sección «Proveedor de tu institución» (y al crear un insumo nuevo).",
      "Cada cambio queda en la auditoría.",
    ],
  },
  {
    id: "ingreso",
    titulo: "Registrar un ingreso (llegan insumos)",
    icono: ArrowDownToLine,
    permiso: "movimientos:ingreso",
    enlace: { href: "/movimientos/ingreso", texto: "Registrar ingreso" },
    pasos: [
      <>Menú <strong>Registrar → Ingreso</strong>.</>,
      <>Busca el <strong>insumo</strong> por nombre o código (o toca <strong>Escanear</strong> y lee el código del envase) y elige la <strong>ubicación de destino</strong>.</>,
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

const COLORES_LEYENDA: readonly EstadoVencimiento[] = ["ROJO", "AMARILLO", "VERDE", "VENCIDO", "SIN_VENCIMIENTO"];

const QUE_HACER: Readonly<Record<EstadoVencimiento, string>> = {
  ROJO: "Úsalo primero para que no se pierda.",
  AMARILLO: "Tenlo presente al planificar el consumo y las compras.",
  VERDE: "Sin urgencia.",
  VENCIDO: "No se puede usar ni retirar: sepáralo; un administrador lo da de baja.",
  SIN_VENCIMIENTO: "El insumo no lleva fecha de vencimiento.",
};

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

      <Card className="mb-4" id="semaforo">
        <CardHeader
          titulo="Semáforo de vencimiento"
          descripcion="Cada lote tiene un color según cuánto falta para que venza. Se usa en toda la aplicación."
        />
        <dl className="divide-y divide-borde">
          {COLORES_LEYENDA.map((estado) => (
            <div key={estado} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
              <dt className="w-36 shrink-0">
                <BadgeEstadoVencimiento estado={estado} />
              </dt>
              <dd className="min-w-0 flex-1 text-[0.9375rem] text-texto">
                <strong className="font-semibold">{DESCRIPCION_SEMAFORO[estado]}.</strong>{" "}
                <span className="text-texto-suave">{QUE_HACER[estado]}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 border-t border-borde pt-3 text-sm text-texto-suave">
          Los meses se cuentan por calendario desde hoy: si hoy es 19 de noviembre, es rojo lo que vence antes del 19 de febrero y verde
          lo que vence desde el 19 de mayo. El día del vencimiento el lote todavía se puede usar. Cada color lleva además una forma
          distinta y su nombre escrito, para distinguirlo sin depender del color.
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
