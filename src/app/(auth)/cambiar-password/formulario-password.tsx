"use client";

import * as React from "react";
import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { cambiarPasswordAccion, type EstadoFormulario } from "@/acciones/auth";
import { Alert, Button, Field, PasswordInput } from "@/components/ui";
import { LARGO_MINIMO_PASSWORD } from "@/lib/esquemas/auth";

const INICIAL: EstadoFormulario = {};

/**
 * Los tres campos son CONTROLADOS: React reinicia los campos no controlados de
 * un `<form action>` cuando la acción termina, y con ello borraba todo tras un
 * error (incluso lo que la persona ya estaba corrigiendo). Los valores viven
 * solo en el navegador; el servidor nunca los devuelve. Tras un error se
 * conserva la contraseña nueva y su repetición; la actual se vacía únicamente
 * si fue la rechazada.
 */
export function FormularioPassword() {
  const [estado, accion, pendiente] = useActionState(cambiarPasswordAccion, INICIAL);
  const [actual, setActual] = React.useState("");
  const [nueva, setNueva] = React.useState("");
  const [confirmacion, setConfirmacion] = React.useState("");
  const refActual = React.useRef<HTMLInputElement>(null);

  // Ajuste de estado durante el render (sin efecto): al llegar un resultado con
  // la contraseña actual rechazada, se vacía solo ese campo.
  const [estadoVisto, setEstadoVisto] = React.useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    if (estado.erroresCampo?.actual) setActual("");
  }
  React.useEffect(() => {
    if (estado.erroresCampo?.actual) refActual.current?.focus();
  }, [estado]);

  return (
    <form action={accion} className="space-y-5" noValidate>
      {estado.error ? <Alert tono="peligro">{estado.error}</Alert> : null}

      <Field label="Contraseña actual" error={estado.erroresCampo?.actual}>
        <PasswordInput
          ref={refActual}
          name="actual"
          autoComplete="current-password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          autoFocus
          required
        />
      </Field>

      <Field
        label="Nueva contraseña"
        error={estado.erroresCampo?.nueva}
        ayuda={`Mínimo ${LARGO_MINIMO_PASSWORD} caracteres, con al menos una letra y un número.`}
      >
        <PasswordInput
          name="nueva"
          autoComplete="new-password"
          minLength={LARGO_MINIMO_PASSWORD}
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          required
        />
      </Field>

      <Field label="Repite la nueva contraseña" error={estado.erroresCampo?.confirmacion}>
        <PasswordInput
          name="confirmacion"
          autoComplete="new-password"
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
          required
        />
      </Field>

      <Button type="submit" size="lg" bloque cargando={pendiente}>
        {pendiente ? "Guardando…" : (
          <>
            <KeyRound aria-hidden />
            Guardar nueva contraseña
          </>
        )}
      </Button>
    </form>
  );
}
