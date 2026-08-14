"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface EditPanelShellProps {
  title: string;
  onReset?: () => void;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function EditPanelShell({
  title,
  onReset,
  onClose,
  children,
  footer,
}: EditPanelShellProps) {
  return (
    <>
      <aside className="hidden w-72 shrink-0 flex-col border-l border-border bg-background lg:flex">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
          <h2 className="min-w-0 truncate text-sm font-semibold">{title}</h2>
          {onReset && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onReset}
            >
              Reset
            </Button>
          )}
        </div>
        {children}
        {footer}
      </aside>

      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className="flex w-72 flex-col gap-0 p-0 lg:hidden"
          overlayClassName="lg:hidden"
        >
          <SheetHeader className="h-12 shrink-0 flex-row items-center justify-between space-y-0 border-b border-border px-3 py-0">
            <SheetTitle className="min-w-0 truncate text-sm">{title}</SheetTitle>
            {onReset && (
              <Button
                variant="ghost"
                size="sm"
                className="mr-6 h-7 text-xs"
                onClick={onReset}
              >
                Reset
              </Button>
            )}
          </SheetHeader>
          {children}
          {footer}
        </SheetContent>
      </Sheet>
    </>
  );
}
