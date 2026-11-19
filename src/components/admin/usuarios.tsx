"use client";

import * as React from "react";
import {
  Check,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  Copy,
  EllipsisVertical,
  KeyRound,
  LockOpen,
  Minus,
  Pencil,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import {
  actualizarUsuarioAccion,
  crearUsuarioAccion,
  desbloquearUsuarioAccion,
  restablecerPasswordUsuarioAccion,
} from "@/acciones/admin-usuarios";
import {
  Alert,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  toast,
  useAccion,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { esquemaCrearUsuario, type EntradaCrearUsuario } from "@/lib/esquemas/usuarios";
import { NOMBRE_ROL, type Rol } from "@/lib/permisos";
import { ConfirmarActivo } from "./boton-cambiar-activo";
import { INFO_ROL, ROLES_ORDENADOS } from "./roles-info";
import { useFocoAlCerrar } from "./use-foco-al-cerrar";
import { texto, useValidacion } from "./use-validacion";

export interface OpcionCentro {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface UsuarioEditable {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  bloqueado: boolean;
  centroIds: string[];
}

interface PasswordEntregada {
  nombre: string;
  email: string;
  passwordTemporal: string;
  motivo: "creado" | "restablecida";
}

// ---------------------------------------------------------------------------
// Contraseña temporal (se muestra UNA vez)
// ---------------------------------------------------------------------------

function DialogoPasswordTemporal({ datos, onCerrar }: { datos: PasswordEntregada; onCerrar: () => void }) {
  const [copiada, setCopiada] = React.useState(false);
  const refCampo = React.useRef<HTMLInputElement>(null);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(datos.passwordTemporal);
      setCopiada(true);
      toast.exito("Contraseña copiada");
    } catch {
      // Sin permiso de portapapeles: se deja seleccionada para copiarla a mano.
      refCampo.current?.select();
      toast.info("Selecciónala y cópiala manualmente");
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
    >
      <DialogContent
        ancho="sm"
        titulo={datos.motivo === "creado" ? "Usuario creado" : "Contraseña restablecida"}
        descripcion={`Entrega esta contraseña temporal a ${datos.nombre}.`}
        onPointerDownOutside={(ev) => ev.preventDefault()}
        onInteractOutside={(ev) => ev.preventDefault()}
      >
        <div className="space-y-4">
          <dl className="text-sm">
            <dt className="text-texto-tenue">Correo electrónico para ingresar</dt>
            <dd className="font-medium break-all text-texto">{datos.email}</dd>
          </dl>
          <div>
            <label htmlFor="password-temporal" className="block text-sm font-medium text-texto">
              Contraseña temporal
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="password-temporal"
                ref={refCampo}
                readOnly
                value={datos.passwordTemporal}
                onFocus={(ev) => ev.currentTarget.select()}
                className="cifras min-h-12 w-full min-w-0 rounded-control border border-marca-200 bg-marca-50 px-3.5 font-mono text-lg font-semibold tracking-wide text-marca-900 focus-visible:ring-4 focus-visible:ring-marca-100 focus-visible:outline-none"
              />
              <Button variant={copiada ? "secundario" : "primario"} size="lg" onClick={copiar} className="shrink-0">
                {copiada ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copiada ? "Copiada" : "Copiar"}
              </Button>
            </div>
          </div>
          <Alert tono="alerta" titulo="Solo se muestra esta vez">
            Cópiala ahora: al cerrar esta ventana no se puede volver a ver. Al ingresar, el sistema le pedirá crear su
            propia contraseña.
          </Alert>
        </div>
        <DialogFooter>
          <Button onClick={onCerrar} variant={copiada ? "primario" : "secundario"}>
            {copiada ? "Listo" : "Cerrar sin copiar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Formulario de usuario
// ---------------------------------------------------------------------------

function SelectorRol({ valor, onCambiar, bloqueado, error }: { valor: Rol | ""; onCambiar: (rol: Rol) => void; bloqueado: boolean; error?: string }) {
  const idError = React.useId();
  return (
    <fieldset aria-describedby={error ? idError : undefined}>
      <legend className="text-sm font-medium text-texto">
        Rol
        <span className="ml-0.5 text-peligro-600" aria-hidden>
          *
        </span>
      </legend>
      <div className="mt-1.5 grid gap-2">
        {ROLES_ORDENADOS.map((rol) => {
          const info = INFO_ROL[rol];
          const elegido = valor === rol;
          const deshabilitado = bloqueado && !elegido;
          return (
            <label
              key={rol}
              className={cn(
                "relative flex gap-3 rounded-control border p-3 transition-colors",
                elegido ? "border-marca-600 bg-marca-50/70 ring-1 ring-marca-600" : "border-borde-fuerte/70 bg-superficie",
                deshabilitado ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:border-marca-400",
                error && !elegido && "border-peligro-600/60",
              )}
            >
              <input
                type="radio"
                name="rol"
                value={rol}
                checked={elegido}
                disabled={deshabilitado}
                onChange={() => onCambiar(rol)}
                className="mt-0.5 size-5 shrink-0 accent-marca-600"
              />
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-semibold text-texto">{NOMBRE_ROL[rol]}</span>
                <span className="block text-sm text-texto-suave">{info.resumen}</span>
                {elegido ? (
                  <span className="mt-2 block space-y-1 text-sm">
                    {info.puede.map((p) => (
                      <span key={p} className="flex items-start gap-1.5 text-texto">
                        <Check className="mt-0.5 size-4 shrink-0 text-exito-600" aria-hidden />
                        {p}
                      </span>
                    ))}
                    {info.noPuede.map((p) => (
                      <span key={p} className="flex items-start gap-1.5 text-texto-suave">
                        <Minus className="mt-0.5 size-4 shrink-0 text-texto-tenue" aria-hidden />
                        {p}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={idError} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-peligro-700">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
    </fieldset>
  );
}

function DialogoUsuario({
  usuario,
  centros,
  esYo,
  onCerrar,
  onPassword,
}: {
  usuario?: UsuarioEditable;
  centros: OpcionCentro[];
  esYo: boolean;
  onCerrar: () => void;
  onPassword: (datos: PasswordEntregada) => void;
}) {
  const crear = useAccion(crearUsuarioAccion, {
    alExito: (r) => onPassword({ ...r, motivo: "creado" }),
    toastError: false,
  });
  const actualizar = useAccion(actualizarUsuarioAccion, {
    exito: (r) => (r.sesionesCerradas > 0 ? "Cambios guardados. Deberá volver a iniciar sesión." : "Cambios guardados"),
    alExito: onCerrar,
    toastError: false,
  });
  const accion = usuario ? actualizar : crear;
  const validacion = useValidacion(esquemaCrearUsuario, accion.erroresCampo);
  const e = validacion.errores;

  const [rol, setRol] = React.useState<Rol | "">(usuario?.rol ?? "");
  const [centroIds, setCentroIds] = React.useState<ReadonlySet<string>>(new Set(usuario?.centroIds ?? []));
  // Centros inactivos solo se listan si el usuario ya los tiene asignados.
  const centrosVisibles = centros.filter((c) => c.activo || usuario?.centroIds.includes(c.id));

  function alternarCentro(id: string, marcado: boolean) {
    setCentroIds((previos) => {
      const copia = new Set(previos);
      if (marcado) copia.add(id);
      else copia.delete(id);
      return copia;
    });
    validacion.limpiarCampo("centroIds");
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const f = new FormData(evento.currentTarget);
    const valores: EntradaCrearUsuario = {
      nombre: texto(f, "nombre"),
      email: texto(f, "email"),
      rol: rol as Rol,
      centroIds: rol === "ADMIN" ? [] : [...centroIds],
    };
    if (!validacion.validar(valores)) return;
    if (usuario) void actualizar.ejecutar({ ...valores, id: usuario.id });
    else void crear.ejecutar(valores);
  }

  const hayErroresCampo = Object.keys(e).length > 0;

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !accion.pendiente) onCerrar();
      }}
    >
      <DialogContent
        ancho="lg"
        titulo={usuario ? "Editar usuario" : "Nuevo usuario"}
        descripcion={
          usuario
            ? "Si cambias su rol o sus centros, tendrá que volver a iniciar sesión."
            : "Al crearlo verás una contraseña temporal para entregarle. La cambiará en su primer ingreso."
        }
      >
        <form noValidate onSubmit={enviar} onChange={validacion.alCambiar} className="space-y-5">
          {accion.error && !hayErroresCampo ? <Alert tono="peligro">{accion.error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre y apellido" requerido error={e.nombre}>
              <Input name="nombre" defaultValue={usuario?.nombre} maxLength={100} autoComplete="off" autoFocus={!usuario} />
            </Field>
            <Field label="Correo electrónico" requerido error={e.email} ayuda="Lo usará para iniciar sesión.">
              <Input
                name="email"
                type="email"
                inputMode="email"
                defaultValue={usuario?.email}
                maxLength={254}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
          </div>

          <SelectorRol
            valor={rol}
            bloqueado={esYo}
            error={e.rol?.[0]}
            onCambiar={(nuevo) => {
              setRol(nuevo);
              validacion.limpiarCampo("rol");
              validacion.limpiarCampo("centroIds");
            }}
          />
          {esYo ? (
            <p className="-mt-2 text-sm text-texto-suave">
              No puedes cambiar tu propio rol. Si necesitas dejar de ser administrador, pídeselo a otro administrador.
            </p>
          ) : null}

          {rol === "ADMIN" ? (
            <Alert tono="info">Los administradores ven y operan todos los centros de la red: no hace falta asignarlos.</Alert>
          ) : rol !== "" ? (
            <fieldset>
              <legend className="text-sm font-medium text-texto">
                Centros asignados
                <span className="ml-0.5 text-peligro-600" aria-hidden>
                  *
                </span>
              </legend>
              <p className="mt-0.5 text-sm text-texto-suave">Solo verá y operará el inventario de los centros que marques.</p>
              <div
                className={cn(
                  "mt-2 grid gap-x-4 rounded-control border px-3.5 py-1 sm:grid-cols-2",
                  e.centroIds ? "border-peligro-600" : "border-borde",
                )}
              >
                {centrosVisibles.map((c) => (
                  <Checkbox
                    key={c.id}
                    label={c.nombre}
                    descripcion={c.activo ? undefined : "Centro inactivo"}
                    checked={centroIds.has(c.id)}
                    onChange={(ev) => alternarCentro(c.id, ev.target.checked)}
                  />
                ))}
                {centrosVisibles.length === 0 ? <p className="py-3 text-sm text-texto-suave">No hay centros activos.</p> : null}
              </div>
              {e.centroIds ? (
                <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-peligro-700">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{e.centroIds[0]}</span>
                </p>
              ) : null}
            </fieldset>
          ) : null}

          <DialogFooter>
            <Button variant="secundario" onClick={onCerrar} disabled={accion.pendiente}>
              Cancelar
            </Button>
            <Button type="submit" cargando={accion.pendiente}>
              {usuario ? "Guardar cambios" : "Crear usuario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Puntos de entrada
// ---------------------------------------------------------------------------

export function BotonNuevoUsuario({ centros }: { centros: OpcionCentro[] }) {
  const [abierto, setAbierto] = React.useState(false);
  const [password, setPassword] = React.useState<PasswordEntregada | null>(null);
  const foco = useFocoAlCerrar();
  return (
    <>
      <Button
        onClick={() => {
          foco.recordar();
          setAbierto(true);
        }}
      >
        <UserPlus aria-hidden />
        Nuevo usuario
      </Button>
      {abierto ? (
        <DialogoUsuario
          centros={centros}
          esYo={false}
          onCerrar={() => {
            setAbierto(false);
            foco.devolver();
          }}
          onPassword={(datos) => {
            setAbierto(false);
            setPassword(datos);
          }}
        />
      ) : null}
      {password ? (
        <DialogoPasswordTemporal
          datos={password}
          onCerrar={() => {
            setPassword(null);
            foco.devolver();
          }}
        />
      ) : null}
    </>
  );
}

type Vista = "editar" | "estado" | "password" | "desbloquear" | null;

/** Menú de acciones por usuario. */
export function AccionesUsuario({ usuario, centros, esYo }: { usuario: UsuarioEditable; centros: OpcionCentro[]; esYo: boolean }) {
  const [vista, setVista] = React.useState<Vista>(null);
  const [password, setPassword] = React.useState<PasswordEntregada | null>(null);
  const contenedor = React.useRef<HTMLSpanElement>(null);
  const foco = useFocoAlCerrar(contenedor);
  const cerrar = () => {
    setVista(null);
    foco.devolver();
  };
  const alCambiar = (v: Exclude<Vista, null>) => (abierto: boolean) => {
    if (abierto) setVista(v);
    else cerrar();
  };

  return (
    <span className="inline-flex" ref={contenedor}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="fantasma" size="icono" aria-label={`Acciones para ${usuario.nombre}`}>
            <EllipsisVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setVista("editar")}>
            <Pencil aria-hidden />
            Editar datos, rol y centros
          </DropdownMenuItem>
          {usuario.bloqueado ? (
            <DropdownMenuItem onSelect={() => setVista("desbloquear")}>
              <LockOpen aria-hidden />
              Desbloquear cuenta
            </DropdownMenuItem>
          ) : null}
          {!esYo && usuario.activo ? (
            <DropdownMenuItem onSelect={() => setVista("password")}>
              <KeyRound aria-hidden />
              Restablecer contraseña
            </DropdownMenuItem>
          ) : null}
          {!esYo ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem peligro={usuario.activo} onSelect={() => setVista("estado")}>
                {usuario.activo ? <CircleSlash aria-hidden /> : <CircleCheck aria-hidden />}
                {usuario.activo ? "Desactivar usuario" : "Reactivar usuario"}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {vista === "editar" ? (
        <DialogoUsuario usuario={usuario} centros={centros} esYo={esYo} onCerrar={cerrar} onPassword={setPassword} />
      ) : null}

      <ConfirmarActivo
        entidad="usuario"
        id={usuario.id}
        nombre={usuario.nombre}
        activo={usuario.activo}
        open={vista === "estado"}
        onOpenChange={alCambiar("estado")}
      />

      <ConfirmDialog
        open={vista === "password"}
        onOpenChange={alCambiar("password")}
        titulo="¿Restablecer la contraseña?"
        descripcion={
          <>
            Se generará una nueva contraseña temporal para <strong className="font-semibold text-texto">{usuario.nombre}</strong>. La
            actual dejará de funcionar y se cerrarán sus sesiones abiertas.
          </>
        }
        textoConfirmar="Restablecer"
        onConfirmar={async () => {
          const r = await restablecerPasswordUsuarioAccion({ id: usuario.id });
          if (r.ok) setPassword({ ...r.datos, motivo: "restablecida" });
          else toast.error("No se pudo restablecer", r.error);
        }}
      />

      <ConfirmDialog
        open={vista === "desbloquear"}
        onOpenChange={alCambiar("desbloquear")}
        titulo="¿Desbloquear la cuenta?"
        descripcion={
          <>
            <strong className="font-semibold text-texto">{usuario.nombre}</strong> quedó bloqueado por varios intentos fallidos.
            Podrá volver a intentar de inmediato con su contraseña actual.
          </>
        }
        textoConfirmar="Desbloquear"
        onConfirmar={async () => {
          const r = await desbloquearUsuarioAccion({ id: usuario.id });
          if (r.ok) toast.exito(`Cuenta de ${usuario.nombre} desbloqueada`);
          else toast.error("No se pudo desbloquear", r.error);
        }}
      />

      {password ? (
        <DialogoPasswordTemporal
          datos={password}
          onCerrar={() => {
            setPassword(null);
            foco.devolver();
          }}
        />
      ) : null}
    </span>
  );
}

/** Distintivo "Tú" junto al usuario en sesión. */
export function DistintivoYo() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-marca-50 px-2 py-0.5 text-xs font-semibold text-marca-800">
      <ShieldCheck className="size-3.5" aria-hidden />
      Tú
    </span>
  );
}
