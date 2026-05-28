import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Clock } from "lucide-react";

interface IdleWarningDialogProps {
  open: boolean;
  secondsLeft: number;
  onContinue: () => void;
}

export function IdleWarningDialog({ open, secondsLeft, onContinue }: IdleWarningDialogProps) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeStr = minutes > 0
    ? `${minutes}:${seconds.toString().padStart(2, "0")} Minuten`
    : `${seconds} Sekunden`;

  // Farbe basierend auf verbleibender Zeit
  const isUrgent = secondsLeft <= 30;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className={`h-5 w-5 ${isUrgent ? "text-red-500 animate-pulse" : "text-amber-500"}`} />
            Sitzung läuft bald ab
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            Du wirst in{" "}
            <span className={`font-bold text-lg ${isUrgent ? "text-red-500" : "text-amber-600"}`}>
              {timeStr}
            </span>{" "}
            automatisch abgemeldet.
            <br />
            <span className="text-sm text-muted-foreground mt-1 block">
              Klick auf „Angemeldet bleiben", um die Sitzung zu verlängern.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={onContinue}
            className="w-full bg-[#6b4c2a] hover:bg-[#5a3d22] text-white"
            data-testid="button-idle-continue"
          >
            Angemeldet bleiben
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
