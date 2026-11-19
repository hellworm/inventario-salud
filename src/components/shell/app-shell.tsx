"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  Check,
  ChevronsUpDown,
  KeyRound,
  LogOut,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cambiarCentroActivoAccion, cerrarSesionAccion } from "@/acciones/auth";
import {
  BadgeRol,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { ETIQUETA_TIPO_CENTRO, type TipoCentro } from "@/lib/estados";
import { hrefActivo, navegacionInferior, navegacionPara, type GrupoNavegacion } from "@/lib/navegacion";
import { NOMBRE_ROL, type Rol } from "@/lib/permisos";
import { Isotipo, Logo } from "./logo";

const COOKIE_SIDEBAR = "ri_sidebar";
const CENTRO_TODOS = "todos";

export interface CentroShell {
  id: string;
  nombre: string;
  tipo: string;
  comuna: string;
}

export interface AppShellProps {
  usuario: { nombre: string; email: string; rol: Rol };
  centros: CentroShell[];
  /** `null` = "Toda la red". */
  centroActivoId: string | null;
  puedeVerTodaLaRed: boolean;
  sidebarColapsadaInicial: boolean;
  children: React.ReactNode;
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

// ---------------------------------------------------------------------------
// Navegación (barra lateral y drawer)
// ---------------------------------------------------------------------------

function ListaNavegacion({
  grupos,
  activo,
  colapsada = false,
  alNavegar,
}: {
  grupos: GrupoNavegacion[];
  activo: string | null;
  colapsada?: boolean;
  alNavegar?: () => void;
}) {
  return (
    <nav aria-label="Principal" className="flex flex-col gap-5">
      {grupos.map((grupo, i) => (
        <div key={grupo.titulo ?? i}>
          {grupo.titulo ? (
            colapsada ? (
              <div className="mx-auto mb-2 h-px w-8 bg-borde" aria-hidden />
            ) : (
              <p className="mb-1.5 px-3 text-xs font-semibold tracking-wider text-texto-tenue uppercase">{grupo.titulo}</p>
            )
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {grupo.items.map(({ href, etiqueta, icono: Icono }) => {
              const esActivo = href === activo;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={alNavegar}
                    aria-current={esActivo ? "page" : undefined}
                    title={colapsada ? etiqueta : undefined}
                    className={cn(
                      "group relative flex min-h-11 items-center gap-3 rounded-lg text-[0.9375rem] font-medium transition-colors",
                      colapsada ? "justify-center px-0" : "px-3",
                      esActivo
                        ? "bg-marca-50 text-marca-800"
                        : "text-texto-suave hover:bg-superficie-2 hover:text-texto",
                    )}
                  >
                    {esActivo ? (
                      <span className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full bg-marca-600" aria-hidden />
                    ) : null}
                    <Icono
                      className={cn("size-5 shrink-0", esActivo ? "text-marca-700" : "text-texto-tenue group-hover:text-texto-suave")}
                      aria-hidden
                    />
                    <span className={cn("truncate", colapsada && "sr-only")}>{etiqueta}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Selector de centro
// ---------------------------------------------------------------------------

function SelectorCentro({
  centros,
  centroActivoId,
  puedeVerTodaLaRed,
}: Pick<AppShellProps, "centros" | "centroActivoId" | "puedeVerTodaLaRed">) {
  const router = useRouter();
  const [pendiente, iniciar] = React.useTransition();
  const activo = centros.find((c) => c.id === centroActivoId) ?? null;
  const Icono = activo ? Building2 : Network;
  const titulo = activo ? activo.nombre : puedeVerTodaLaRed ? "Toda la red" : "Sin centro asignado";
  const subtitulo = activo
    ? `${ETIQUETA_TIPO_CENTRO[activo.tipo as TipoCentro] ?? activo.tipo} · ${activo.comuna}`
    : puedeVerTodaLaRed
      ? `${centros.length} ${centros.length === 1 ? "centro" : "centros"}`
      : "Contacta a un administrador";
  const opciones = centros.length + (puedeVerTodaLaRed ? 1 : 0);

  const contenido = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-700">
        <Icono className="size-[1.125rem]" aria-hidden />
      </span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm leading-5 font-semibold text-texto">{titulo}</span>
        <span className="block truncate text-xs leading-4 text-texto-tenue">{subtitulo}</span>
      </span>
    </>
  );

  if (opciones <= 1) {
    return <div className="flex min-w-0 items-center gap-2.5 py-1 pr-2">{contenido}</div>;
  }

  const elegir = (valor: string) =>
    iniciar(async () => {
      await cambiarCentroActivoAccion(valor);
      router.refresh();
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex min-h-11 max-w-full min-w-0 items-center gap-2.5 rounded-xl border border-transparent py-1 pr-2 pl-1 transition-colors",
          "hover:border-borde hover:bg-superficie-2 data-[state=open]:border-borde data-[state=open]:bg-superficie-2",
          pendiente && "opacity-60",
        )}
        aria-label={`Centro activo: ${titulo}. Cambiar centro`}
      >
        {contenido}
        <ChevronsUpDown className="size-4 shrink-0 text-texto-tenue" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(20rem,calc(100vw-1.5rem))]">
        <DropdownMenuLabel>Centro activo</DropdownMenuLabel>
        {puedeVerTodaLaRed ? (
          <>
            <DropdownMenuItem onSelect={() => elegir(CENTRO_TODOS)}>
              <Network aria-hidden />
              <span className="flex-1">Toda la red</span>
              {centroActivoId === null ? <Check className="!text-marca-700" aria-label="Seleccionado" /> : null}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {centros.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => elegir(c.id)} className="h-auto py-2">
            <Building2 aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{c.nombre}</span>
              <span className="block truncate text-xs text-texto-tenue">
                {ETIQUETA_TIPO_CENTRO[c.tipo as TipoCentro] ?? c.tipo} · {c.comuna}
              </span>
            </span>
            {c.id === centroActivoId ? <Check className="!text-marca-700" aria-label="Seleccionado" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Menú de usuario
// ---------------------------------------------------------------------------

function MenuUsuario({ usuario }: Pick<AppShellProps, "usuario">) {
  const [saliendo, iniciar] = React.useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex min-h-11 items-center gap-2.5 rounded-full py-1 pr-1 pl-1 transition-colors hover:bg-superficie-2 data-[state=open]:bg-superficie-2 sm:rounded-xl sm:pr-3"
        aria-label={`Menú de usuario: ${usuario.nombre}`}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marca-600 text-sm font-semibold text-white">
          {iniciales(usuario.nombre)}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-40 truncate text-sm leading-5 font-semibold text-texto">{usuario.nombre}</span>
          <span className="block text-xs leading-4 text-texto-tenue">{NOMBRE_ROL[usuario.rol]}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="px-3 py-2.5">
          <p className="truncate font-semibold text-texto">{usuario.nombre}</p>
          <p className="truncate text-sm text-texto-suave">{usuario.email}</p>
          <BadgeRol rol={usuario.rol} className="mt-2" />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/cambiar-password">
            <KeyRound aria-hidden />
            Cambiar contraseña
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          peligro
          disabled={saliendo}
          onSelect={(e) => {
            e.preventDefault();
            iniciar(() => cerrarSesionAccion());
          }}
        >
          <LogOut aria-hidden />
          {saliendo ? "Saliendo…" : "Salir"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function AppShell({
  usuario,
  centros,
  centroActivoId,
  puedeVerTodaLaRed,
  sidebarColapsadaInicial,
  children,
}: AppShellProps) {
  const ruta = usePathname();
  const [colapsada, setColapsada] = React.useState(sidebarColapsadaInicial);
  const [menuAbierto, setMenuAbierto] = React.useState(false);

  const grupos = React.useMemo(() => navegacionPara(usuario.rol), [usuario.rol]);
  const inferior = React.useMemo(() => navegacionInferior(usuario.rol), [usuario.rol]);
  const activo = hrefActivo(ruta, grupos.flatMap((g) => g.items));
  const activoInferior = inferior.some((i) => i.href === activo) ? activo : null;

  function alternarSidebar() {
    setColapsada((valor) => {
      const nuevo = !valor;
      document.cookie = `${COOKIE_SIDEBAR}=${nuevo ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return nuevo;
    });
  }

  return (
    <div className="min-h-dvh">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-lg focus:bg-marca-700 focus:px-4 focus:py-2.5 focus:text-white"
      >
        Saltar al contenido
      </a>

      {/* Barra lateral (escritorio) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-borde bg-superficie transition-[width] duration-200 lg:flex",
          colapsada ? "w-[4.75rem]" : "w-[17rem]",
        )}
      >
        <div className={cn("flex h-16 shrink-0 items-center border-b border-borde", colapsada ? "justify-center" : "px-5")}>
          <Link href="/panel" aria-label="RedInsumos, ir al panel" className="rounded-lg">
            {colapsada ? <Isotipo /> : <Logo />}
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <ListaNavegacion grupos={grupos} activo={activo} colapsada={colapsada} />
        </div>
        <div className="shrink-0 border-t border-borde p-3">
          <button
            type="button"
            onClick={alternarSidebar}
            aria-expanded={!colapsada}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 rounded-lg text-sm font-medium text-texto-suave hover:bg-superficie-2 hover:text-texto",
              colapsada ? "justify-center" : "px-3",
            )}
          >
            {colapsada ? <PanelLeftOpen className="size-5 text-texto-tenue" aria-hidden /> : <PanelLeftClose className="size-5 text-texto-tenue" aria-hidden />}
            <span className={cn(colapsada && "sr-only")}>{colapsada ? "Expandir menú" : "Contraer menú"}</span>
          </button>
        </div>
      </aside>

      <div className={cn("transition-[padding] duration-200", colapsada ? "lg:pl-[4.75rem]" : "lg:pl-[17rem]")}>
        {/* Barra superior */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-borde bg-superficie/90 px-3 backdrop-blur-md sm:px-5 lg:px-8">
          <Link href="/panel" aria-label="RedInsumos, ir al panel" className="mr-1 shrink-0 rounded-lg lg:hidden">
            <Isotipo />
          </Link>
          <div className="min-w-0 flex-1">
            <SelectorCentro centros={centros} centroActivoId={centroActivoId} puedeVerTodaLaRed={puedeVerTodaLaRed} />
          </div>
          <MenuUsuario usuario={usuario} />
        </header>

        <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-[84rem] px-4 pt-6 pb-28 outline-none sm:px-6 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Navegación inferior (móvil y tablet) */}
      <nav
        aria-label="Accesos rápidos"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-borde bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <ul className="mx-auto flex max-w-2xl items-stretch">
          {inferior.map(({ href, etiqueta, corta, icono: Icono }) => {
            const esActivo = href === activoInferior;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={esActivo ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-[3.75rem] flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium",
                    esActivo ? "text-marca-700" : "text-texto-suave",
                  )}
                >
                  {esActivo ? <span className="absolute top-0 h-[3px] w-10 rounded-b-full bg-marca-600" aria-hidden /> : null}
                  <Icono className="size-[1.375rem]" aria-hidden />
                  <span className="max-w-full truncate">{corta ?? etiqueta}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMenuAbierto(true)}
              aria-haspopup="dialog"
              className={cn(
                "flex min-h-[3.75rem] w-full flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium",
                activo && !activoInferior ? "text-marca-700" : "text-texto-suave",
              )}
            >
              <Menu className="size-[1.375rem]" aria-hidden />
              <span>Menú</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
        <SheetContent lado="izquierda" titulo="Menú de navegación" sinEncabezado>
          <div className="flex h-16 shrink-0 items-center border-b border-borde px-5">
            <Logo />
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <ListaNavegacion grupos={grupos} activo={activo} alNavegar={() => setMenuAbierto(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
