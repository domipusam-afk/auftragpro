import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function ZugriffGesperrt({ modul }: { modul?: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <ShieldOff className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold mb-2">Kein Zugriff</h2>
      <p className="text-sm text-muted-foreground max-w-xs">
        Du hast keine Berechtigung{modul ? ` für „${modul}"` : ""}.<br />
        Bitte wende dich an deinen Administrator.
      </p>
      <Button variant="outline" className="mt-6" onClick={() => navigate("/")}>
        Zurück zum Dashboard
      </Button>
    </div>
  );
}
