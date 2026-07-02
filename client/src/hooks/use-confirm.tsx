import { useState, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmOptions {
  title?: string;
  description?: string;
}

export function useConfirm() {
  const [pending, setPending] = useState<{
    resolve: (v: boolean) => void;
    title: string;
    description: string;
  } | null>(null);

  const confirm = useCallback((options: ConfirmOptions = {}): Promise<boolean> => {
    return new Promise((resolve) => {
      setPending({
        resolve,
        title: options.title ?? "Eintrag löschen?",
        description: options.description ?? "Diese Aktion kann nicht rückgängig gemacht werden.",
      });
    });
  }, []);

  const ConfirmDialog = useCallback(() => {
    if (!pending) return null;
    return (
      <AlertDialog open onOpenChange={(v) => { if (!v) { pending.resolve(false); setPending(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending.title}</AlertDialogTitle>
            <AlertDialogDescription>{pending.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { pending.resolve(false); setPending(null); }}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { pending.resolve(true); setPending(null); }}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }, [pending]);

  return { confirm, ConfirmDialog };
}
