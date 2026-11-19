"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

/**
 * Pestañas accesibles (Radix).
 *
 * ```tsx
 * <Tabs defaultValue="stock">
 *   <TabsList>
 *     <TabsTrigger value="stock">Stock</TabsTrigger>
 *     <TabsTrigger value="vencimientos" contador={4}>Vencimientos</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="stock">…</TabsContent>
 * </Tabs>
 * ```
 */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("-mb-px flex gap-1 overflow-x-auto border-b border-borde [scrollbar-width:none]", className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  contador,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & { contador?: number }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-3.5 text-[0.9375rem] font-medium whitespace-nowrap text-texto-suave transition-colors",
        "hover:text-texto data-[state=active]:border-marca-600 data-[state=active]:text-marca-800",
        className,
      )}
      {...props}
    >
      {children}
      {contador !== undefined ? (
        <span className="cifras rounded-full bg-superficie-2 px-2 py-0.5 text-xs font-semibold text-texto-suave ring-1 ring-borde ring-inset">
          {contador}
        </span>
      ) : null}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-4 focus-visible:outline-offset-4", className)} {...props} />;
}
