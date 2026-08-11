import type { Status } from "./schema";

/** Status, die in der Dashboard-KPI «In Bearbeitung» zusammengefasst werden. */
export const STATUS_IN_BEARBEITUNG: readonly Status[] = [
  "in_arbeit",
  "qualitaet",
  "rechnung",
];

/** Status, die nicht in der Dashboard-KPI «Gesamt» enthalten sind. */
export const STATUS_GESAMT_EXCLUDED: readonly Status[] = ["storniert"];
