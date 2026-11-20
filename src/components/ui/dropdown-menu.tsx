"use client";

import * as React from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/cn";

/** Menú desplegable accesible (Radix): teclado, foco y cierre con Esc. */
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
/** Grupo de opciones excluyentes (`menuitemradio`); el estilo lo pone quien lo usa. */
export const DropdownMenuRadioGroup = Menu.RadioGroup;
export const DropdownMenuRadioItem = Menu.RadioItem;

export function DropdownMenuContent({ className, sideOffset = 8, ...props }: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-56 overflow-y-auto rounded-xl border border-borde bg-superficie-alta p-1.5 shadow-flotante data-[state=open]:animate-subir",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  peligro,
  ...props
}: React.ComponentProps<typeof Menu.Item> & { peligro?: boolean }) {
  return (
    <Menu.Item
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[0.9375rem] outline-none select-none [&_svg]:size-[1.125rem] [&_svg]:shrink-0",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        peligro
          ? "text-peligro-700 data-[highlighted]:bg-peligro-50"
          : "text-texto data-[highlighted]:bg-marca-50 data-[highlighted]:text-marca-900 [&_svg]:text-texto-tenue",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-3 py-2 text-xs font-semibold tracking-wide text-texto-tenue uppercase", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("my-1.5 h-px bg-borde", className)} {...props} />;
}
