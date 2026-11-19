"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CameraOff, Check, Flashlight, FlashlightOff, Keyboard, Loader2, LockKeyhole, RefreshCw, ShieldAlert, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { interpretarCodigo, LARGO_MAXIMO_CODIGO } from "@/lib/gs1";
import type { Lector } from "./lector";

type Estado =
  | "iniciando"
  | "activa"
  /** La persona (o el navegador) negó el permiso de cámara. */
  | "sin-permiso"
  /** El dispositivo no tiene cámara o el navegador no la ofrece. */
  | "sin-camara"
  /** La página no se abrió por HTTPS: el navegador no entrega la cámara. */
  | "inseguro"
  /** Otra aplicación está usando la cámara. */
  | "ocupada"
  /** La cámara funciona pero no se pudo cargar el lector de códigos. */
  | "sin-lector";

const AYUDA: Record<Exclude<Estado, "iniciando" | "activa">, { icono: typeof CameraOff; titulo: string; texto: string; reintentar: boolean }> = {
  "sin-permiso": {
    icono: LockKeyhole,
    titulo: "Falta el permiso para usar la cámara",
    texto:
      "Para habilitarlo: toca el candado (en iPhone, «aA») junto a la dirección del sitio, entra a los permisos, deja Cámara en «Permitir» y vuelve a intentarlo. Mientras tanto puedes escribir el código.",
    reintentar: true,
  },
  "sin-camara": {
    icono: CameraOff,
    titulo: "No encontramos una cámara",
    texto: "Este equipo no tiene cámara disponible. Escribe el código o usa un lector de códigos de barras conectado: funciona igual.",
    reintentar: true,
  },
  inseguro: {
    icono: ShieldAlert,
    titulo: "La cámara necesita una conexión segura",
    texto:
      "El navegador solo entrega la cámara a sitios abiertos con HTTPS (candado en la dirección). Avisa a quien administra el sistema; mientras tanto puedes escribir el código.",
    reintentar: false,
  },
  ocupada: {
    icono: CameraOff,
    titulo: "La cámara está ocupada",
    texto: "Otra aplicación la está usando. Ciérrala y vuelve a intentarlo, o escribe el código.",
    reintentar: true,
  },
  "sin-lector": {
    icono: CameraOff,
    titulo: "No se pudo cargar el lector",
    texto: "Revisa tu conexión y vuelve a intentarlo, o escribe el código.",
    reintentar: true,
  },
};

/** Clasifica el error de `getUserMedia`. */
function estadoDeError(error: unknown): Estado {
  const nombre = error instanceof Error ? error.name : "";
  if (nombre === "NotAllowedError" || nombre === "SecurityError") return "sin-permiso";
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError" || nombre === "DevicesNotFoundError") return "sin-camara";
  if (nombre === "NotReadableError" || nombre === "AbortError" || nombre === "TrackStartError") return "ocupada";
  return "sin-camara";
}

/** Pitido corto de confirmación (si el navegador lo permite; nunca falla). */
function pitido() {
  try {
    const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexto) return;
    const audio = new Contexto();
    const oscilador = audio.createOscillator();
    const volumen = audio.createGain();
    oscilador.frequency.value = 1320;
    volumen.gain.value = 0.08;
    oscilador.connect(volumen).connect(audio.destination);
    oscilador.start();
    oscilador.stop(audio.currentTime + 0.09);
    oscilador.onended = () => void audio.close().catch(() => undefined);
  } catch {
    // Sin audio: el aviso visual y la vibración bastan.
  }
}

export interface DialogoEscanerProps {
  abierto: boolean;
  onCerrar: () => void;
  /** Código leído por la cámara o escrito a mano (texto crudo: lo interpreta `@/lib/gs1`). */
  onCodigo: (texto: string) => void;
  titulo?: string;
  descripcion?: string;
  /** Dónde dejar el foco al cerrar (por defecto, donde estaba al abrir). */
  onCloseAutoFocus?: (evento: Event) => void;
}

/**
 * Escáner de códigos con la cámara del dispositivo. A pantalla completa en
 * celular. Siempre ofrece "Escribir el código" (sirve también para lectores
 * USB o Bluetooth, que escriben como un teclado y envían Enter).
 *
 * La cámara se libera al cerrar, al leer un código, al desmontar el componente
 * y cuando la pestaña pasa a segundo plano.
 */
export default function DialogoEscaner({
  abierto,
  onCerrar,
  onCodigo,
  titulo = "Escanear código",
  descripcion = "Apunta la cámara al código de barras o al cuadrado (DataMatrix) del envase.",
  onCloseAutoFocus,
}: DialogoEscanerProps) {
  const refVideo = React.useRef<HTMLVideoElement>(null);
  const refManual = React.useRef<HTMLInputElement>(null);
  const refFlujo = React.useRef<MediaStream | null>(null);
  const refTemporizador = React.useRef<number | null>(null);
  const refSesion = React.useRef(0);
  const refOnCodigo = React.useRef(onCodigo);
  React.useEffect(() => {
    refOnCodigo.current = onCodigo;
  }, [onCodigo]);

  const [estado, setEstado] = React.useState<Estado>("iniciando");
  const [leido, setLeido] = React.useState(false);
  const [linterna, setLinterna] = React.useState<{ disponible: boolean; encendida: boolean }>({ disponible: false, encendida: false });
  const [manual, setManual] = React.useState("");
  const [errorManual, setErrorManual] = React.useState<string | null>(null);

  const detener = React.useCallback(() => {
    refSesion.current++;
    if (refTemporizador.current !== null) window.clearTimeout(refTemporizador.current);
    refTemporizador.current = null;
    refFlujo.current?.getTracks().forEach((pista) => pista.stop());
    refFlujo.current = null;
    if (refVideo.current) refVideo.current.srcObject = null;
    setLinterna({ disponible: false, encendida: false });
  }, []);

  const entregar = React.useCallback(
    (texto: string) => {
      detener();
      setLeido(true);
      try {
        navigator.vibrate?.(80);
      } catch {
        // Sin vibración.
      }
      pitido();
      // Un instante con la marca de "leído" a la vista antes de continuar.
      window.setTimeout(() => refOnCodigo.current(texto), 350);
    },
    [detener],
  );

  const iniciar = React.useCallback(async () => {
    detener();
    const sesion = refSesion.current;
    const vigente = () => refSesion.current === sesion;
    setLeido(false);
    setEstado("iniciando");

    if (!window.isSecureContext) return setEstado("inseguro");
    if (!navigator.mediaDevices?.getUserMedia) return setEstado("sin-camara");

    let flujo: MediaStream;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (error) {
      if (vigente()) setEstado(estadoDeError(error));
      return;
    }
    if (!vigente()) {
      flujo.getTracks().forEach((pista) => pista.stop());
      return;
    }
    refFlujo.current = flujo;
    const video = refVideo.current;
    if (!video) return detener();
    video.srcObject = flujo;
    try {
      await video.play();
    } catch {
      // Reproducción interrumpida (el diálogo se cerró): no hay nada que mostrar.
    }
    if (!vigente()) return;

    const pista = flujo.getVideoTracks()[0];
    const capacidades = (pista?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
    setLinterna({ disponible: capacidades.torch === true, encendida: false });

    let lector: Lector;
    try {
      lector = await (await import("./lector")).obtenerLector();
    } catch {
      if (vigente()) {
        detener();
        setEstado("sin-lector");
      }
      return;
    }
    if (!vigente()) return;
    setEstado("activa");

    const ciclo = async () => {
      if (!vigente()) return;
      try {
        const lectura = await lector.leer(video);
        if (!vigente()) return;
        if (lectura && interpretarCodigo(lectura.texto)) return entregar(lectura.texto);
      } catch {
        // Un cuadro ilegible no detiene el escaneo.
      }
      refTemporizador.current = window.setTimeout(ciclo, 140);
    };
    void ciclo();
  }, [detener, entregar]);

  // Abre y cierra la cámara junto con el diálogo.
  React.useEffect(() => {
    if (!abierto) return;
    const inicio = window.setTimeout(() => void iniciar(), 0);
    return () => {
      window.clearTimeout(inicio);
      detener();
    };
  }, [abierto, iniciar, detener]);

  // En segundo plano no se retiene la cámara; al volver se retoma.
  React.useEffect(() => {
    if (!abierto) return;
    const alCambiar = () => {
      if (document.hidden) detener();
      else if (!refFlujo.current) void iniciar();
    };
    document.addEventListener("visibilitychange", alCambiar);
    return () => document.removeEventListener("visibilitychange", alCambiar);
  }, [abierto, iniciar, detener]);

  // Sin cámara, el foco va al campo de texto: un lector USB puede escribir de inmediato.
  React.useEffect(() => {
    if (abierto && estado !== "iniciando" && estado !== "activa") refManual.current?.focus();
  }, [abierto, estado]);

  async function alternarLinterna() {
    const pista = refFlujo.current?.getVideoTracks()[0];
    if (!pista) return;
    const encendida = !linterna.encendida;
    try {
      await pista.applyConstraints({ advanced: [{ torch: encendida } as MediaTrackConstraintSet] });
      setLinterna({ disponible: true, encendida });
    } catch {
      setLinterna({ disponible: false, encendida: false });
    }
  }

  function enviarManual(evento: React.FormEvent) {
    evento.preventDefault();
    evento.stopPropagation();
    const texto = manual.trim();
    if (!texto) return setErrorManual("Escribe el código que aparece bajo las barras.");
    if (!interpretarCodigo(texto)) return setErrorManual("Ese código no se puede leer. Revísalo e inténtalo de nuevo.");
    setErrorManual(null);
    detener();
    refOnCodigo.current(texto);
  }

  const ayuda = estado === "iniciando" || estado === "activa" ? null : AYUDA[estado];
  const IconoAyuda = ayuda?.icono;

  return (
    <DialogPrimitive.Root
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor) {
          detener();
          onCerrar();
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-noche-950/70 data-[state=open]:animate-aparecer" />
        <DialogPrimitive.Content
          data-escaner={estado}
          data-leido={leido || undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn(
            "fixed inset-0 z-[60] flex flex-col bg-noche-950 text-white focus:outline-none",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[min(44rem,92dvh)] sm:w-[min(34rem,94vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-hidden sm:rounded-2xl sm:shadow-flotante",
          )}
        >
          <div className="flex shrink-0 items-center gap-3 pt-[max(0.5rem,env(safe-area-inset-top))] pr-2 pb-2 pl-4">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">{titulo}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-white/80">{descripcion}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15"
              aria-label="Cerrar el escáner"
            >
              <X className="size-6" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
            {/* El video siempre está montado: el flujo de la cámara se le asigna al abrir. */}
            <video
              ref={refVideo}
              playsInline
              muted
              autoPlay
              aria-label="Vista de la cámara"
              className={cn("size-full object-cover", estado !== "activa" && estado !== "iniciando" && "hidden")}
            />

            {estado === "activa" || estado === "iniciando" || leido ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 p-6" aria-hidden>
                <div
                  className={cn(
                    "relative aspect-[4/3] w-[min(78%,22rem)] rounded-2xl border-2 shadow-[0_0_0_100vmax_rgb(0_0_0/0.45)] transition-colors",
                    leido ? "border-exito-fijo bg-exito-fijo/25" : "border-white/85",
                  )}
                >
                  {leido ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex size-16 items-center justify-center rounded-full bg-exito-fijo text-white">
                        <Check className="size-9" strokeWidth={3} />
                      </span>
                    </span>
                  ) : estado === "iniciando" ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="size-9 animate-spin text-white/90" />
                    </span>
                  ) : (
                    <span className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-noche-300/90" />
                  )}
                </div>
              </div>
            ) : null}

            {ayuda && IconoAyuda && !leido ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-noche-950 p-6 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-white/10">
                  <IconoAyuda className="size-7" aria-hidden />
                </span>
                <p className="text-lg font-semibold">{ayuda.titulo}</p>
                <p className="max-w-sm text-[0.9375rem] text-white/85">{ayuda.texto}</p>
                {ayuda.reintentar ? (
                  <Button variant="secundario" onClick={() => void iniciar()}>
                    <RefreshCw aria-hidden />
                    Reintentar
                  </Button>
                ) : null}
              </div>
            ) : null}

            <p role="status" aria-live="polite" className="sr-only">
              {leido
                ? "Código leído."
                : estado === "activa"
                  ? "Cámara lista. Apunta al código."
                  : estado === "iniciando"
                    ? "Abriendo la cámara…"
                    : (ayuda?.titulo ?? "")}
            </p>

            {linterna.disponible && estado === "activa" ? (
              <button
                type="button"
                onClick={() => void alternarLinterna()}
                aria-pressed={linterna.encendida}
                className={cn(
                  "absolute right-3 bottom-3 flex min-h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold backdrop-blur-md",
                  linterna.encendida ? "bg-white text-noche-950" : "bg-black/55 text-white hover:bg-black/70",
                )}
              >
                {linterna.encendida ? <FlashlightOff className="size-5" aria-hidden /> : <Flashlight className="size-5" aria-hidden />}
                {linterna.encendida ? "Apagar linterna" : "Linterna"}
              </button>
            ) : null}
          </div>

          <form
            noValidate
            onSubmit={enviarManual}
            className="shrink-0 space-y-1.5 bg-superficie px-4 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] text-texto sm:px-5"
          >
            <label htmlFor="escaner-codigo-manual" className="flex items-center gap-2 text-sm font-medium">
              <Keyboard className="size-4 text-texto-tenue" aria-hidden />
              Escribir el código
            </label>
            <div className="flex items-start gap-2">
              <Input
                ref={refManual}
                id="escaner-codigo-manual"
                name="codigo"
                value={manual}
                onChange={(e) => {
                  setManual(e.target.value);
                  if (errorManual) setErrorManual(null);
                }}
                maxLength={LARGO_MAXIMO_CODIGO}
                inputMode="text"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Ej.: 7804100000006"
                aria-invalid={errorManual ? true : undefined}
                aria-describedby="escaner-codigo-ayuda"
                className="cifras"
              />
              <Button type="submit" className="shrink-0">
                Buscar
              </Button>
            </div>
            <p id="escaner-codigo-ayuda" className={cn("text-xs", errorManual ? "font-medium text-peligro-700" : "text-texto-suave")} role={errorManual ? "alert" : undefined}>
              {errorManual ?? "Los números bajo las barras. También sirve un lector de códigos conectado."}
            </p>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
