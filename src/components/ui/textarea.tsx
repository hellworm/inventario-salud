"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { controlClasses, useCampo } from "./field";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, rows = 3, ...props }: TextareaProps) {
  const { invalido, ...campo } = useCampo(props);
  return <textarea rows={rows} {...props} {...campo} className={cn(controlClasses(invalido), "resize-y", className)} />;
}
