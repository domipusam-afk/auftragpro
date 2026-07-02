/**
 * Löst einen direkten PDF-Download aus.
 * Der Browser öffnet die Datei danach automatisch im PDF-Viewer — kein neuer Tab nötig.
 */
export function downloadPdf(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
