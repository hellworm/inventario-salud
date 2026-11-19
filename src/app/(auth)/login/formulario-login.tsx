"use client";

import { useActionState } from "react";
import { LogIn, Mail } from "lucide-react";
import { iniciarSesionAccion, type EstadoFormulario } from "@/acciones/auth";
import { Alert, Button, Field, Input, PasswordInput } from "@/components/ui";

const INICIAL: EstadoFormulario = {};

export function FormularioLogin({ destino }: { destino?: string }) {
  const [estado, accion, pendiente] = useActionState(iniciarSesionAccion, INICIAL);

  return (
    <form action={accion} className="space-y-5" noValidate>
      {destino ? <input type="hidden" name="destino" value={destino} /> : null}
      {estado.error ? <Alert tono="peligro">{estado.error}</Alert> : null}

      <Field label="Correo electrónico" error={estado.erroresCampo?.email}>
        <Input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="nombre@centro.cl"
          defaultValue={estado.valores?.email ?? ""}
          inicio={<Mail aria-hidden />}
          autoFocus
          required
        />
      </Field>

      <Field label="Contraseña" error={estado.erroresCampo?.password}>
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>

      <Button type="submit" size="lg" bloque cargando={pendiente}>
        {pendiente ? "Ingresando…" : (
          <>
            <LogIn aria-hidden />
            Ingresar
          </>
        )}
      </Button>
    </form>
  );
}
