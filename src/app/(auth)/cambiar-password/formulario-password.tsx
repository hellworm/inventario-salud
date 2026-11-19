"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { cambiarPasswordAccion, type EstadoFormulario } from "@/acciones/auth";
import { Alert, Button, Field, PasswordInput } from "@/components/ui";
import { LARGO_MINIMO_PASSWORD } from "@/lib/esquemas/auth";

const INICIAL: EstadoFormulario = {};

export function FormularioPassword() {
  const [estado, accion, pendiente] = useActionState(cambiarPasswordAccion, INICIAL);

  return (
    <form action={accion} className="space-y-5" noValidate>
      {estado.error ? <Alert tono="peligro">{estado.error}</Alert> : null}

      <Field label="Contraseña actual" error={estado.erroresCampo?.actual}>
        <PasswordInput name="actual" autoComplete="current-password" autoFocus required />
      </Field>

      <Field
        label="Nueva contraseña"
        error={estado.erroresCampo?.nueva}
        ayuda={`Mínimo ${LARGO_MINIMO_PASSWORD} caracteres, con al menos una letra y un número.`}
      >
        <PasswordInput name="nueva" autoComplete="new-password" minLength={LARGO_MINIMO_PASSWORD} required />
      </Field>

      <Field label="Repite la nueva contraseña" error={estado.erroresCampo?.confirmacion}>
        <PasswordInput name="confirmacion" autoComplete="new-password" required />
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
