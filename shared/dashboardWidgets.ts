/**
 * Shared dashboard widget catalogue.
 *
 * Widget IDs are deliberately stable persistence keys: labels can change
 * without invalidating saved per-user dashboard preferences.
 */
export const DASHBOARD_WIDGETS = [
  {
    id: "kpi_auftraege",
    label: "Auftragsübersicht",
    description: "Gesamt, offene, laufende und abgeschlossene Aufträge",
    default_visible: true,
    default_order: 10,
  },
  {
    id: "kpi_offerten",
    label: "Offertenübersicht",
    description: "Offene, angenommene und abgelaufene Offerten",
    default_visible: true,
    default_order: 20,
  },
  {
    id: "aufgaben",
    label: "Offene Aufgaben",
    description: "Die dringendsten offenen Aufgaben des Teams",
    default_visible: true,
    default_order: 25,
  },
  {
    id: "kpi_finanzen",
    label: "Finanzen Übersicht",
    description: "Umsatz, offene Posten, Reingewinn und Mahnungen",
    default_visible: true,
    default_order: 30,
  },
  {
    id: "ueberfaellige_rechnungen",
    label: "Überfällige Rechnungen",
    description: "Offene Bruttobeträge und die ältesten überfälligen Rechnungen",
    default_visible: true,
    default_order: 35,
  },
  {
    id: "top_kunden",
    label: "Top-Kunden (YTD)",
    description: "Top 5 Kunden nach fakturiertem Netto-Umsatz seit Jahresbeginn",
    default_visible: true,
    default_order: 36,
  },
  {
    id: "umsatz_charts",
    label: "Umsatzdiagramme",
    description: "Umsatz der letzten sechs Monate und Jahresvergleich",
    default_visible: true,
    default_order: 40,
  },
  {
    id: "faelligkeits_warnungen",
    label: "Fälligkeits-Warnungen",
    description: "Überfällige und bald fällige Vorgänge",
    default_visible: true,
    default_order: 50,
  },
  {
    id: "neueste_auftraege",
    label: "Neueste Aufträge",
    description: "Die fünf zuletzt erstellten Aufträge",
    default_visible: true,
    default_order: 60,
  },
  {
    id: "dringende_auftraege",
    label: "Dringende Aufträge",
    description: "Offene Aufträge mit Priorität «dringend»",
    default_visible: true,
    default_order: 70,
  },
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]["id"];

export const DASHBOARD_WIDGET_IDS = DASHBOARD_WIDGETS.map((widget) => widget.id) as DashboardWidgetId[];

export const DASHBOARD_REMINDER_SETTINGS = [
  {
    id: "vorkalkulation_fehlt",
    label: "Auftrag ohne Vorkalkulation",
    description: "Hinweis, wenn für einen laufenden Auftrag keine Vorkalkulation vorhanden ist.",
  },
  {
    id: "auftrag_ohne_termin",
    label: "Auftrag ohne Termin",
    description: "Hinweis, wenn für einen laufenden Auftrag kein Termin geplant ist.",
  },
  {
    id: "rechnung_ueberfaellig",
    label: "Überfällige Rechnung",
    description: "Hinweis, wenn eine unbezahlte Rechnung über ihrem Fälligkeitsdatum liegt.",
  },
  {
    id: "angebot_ohne_antwort",
    label: "Offerte ohne Antwort",
    description: "Vorbereitung für die spätere Angebots-Erinnerung.",
  },
] as const;

export type DashboardReminderSettingId = (typeof DASHBOARD_REMINDER_SETTINGS)[number]["id"];

export type DashboardReminderSettings = Record<DashboardReminderSettingId, boolean>;

export interface DashboardPreferences {
  visible_widgets: DashboardWidgetId[];
  widget_order: DashboardWidgetId[];
  reminder_settings: DashboardReminderSettings;
}

export function isDashboardWidgetId(value: unknown): value is DashboardWidgetId {
  return typeof value === "string" && DASHBOARD_WIDGET_IDS.indexOf(value as DashboardWidgetId) !== -1;
}

export function isDashboardReminderSettingId(value: unknown): value is DashboardReminderSettingId {
  return typeof value === "string"
    && DASHBOARD_REMINDER_SETTINGS.some((setting) => setting.id === value);
}

export function createDefaultDashboardPreferences(): DashboardPreferences {
  const reminder_settings = {} as DashboardReminderSettings;
  for (const setting of DASHBOARD_REMINDER_SETTINGS) {
    reminder_settings[setting.id] = true;
  }

  const widgetIds = DASHBOARD_WIDGETS
    .slice()
    .sort((left, right) => left.default_order - right.default_order)
    .map((widget) => widget.id);

  return {
    visible_widgets: widgetIds.filter((id) =>
      DASHBOARD_WIDGETS.some((widget) => widget.id === id && widget.default_visible),
    ),
    widget_order: [...widgetIds],
    reminder_settings,
  };
}

function uniqueKnownWidgetIds(value: unknown, fallback: DashboardWidgetId[]): DashboardWidgetId[] {
  if (!Array.isArray(value)) return [...fallback];

  const ids: DashboardWidgetId[] = [];
  for (const entry of value) {
    if (isDashboardWidgetId(entry) && ids.indexOf(entry) === -1) ids.push(entry);
  }
  return ids;
}

/**
 * Defensively completes persisted preferences. This lets future registry
 * additions appear at the end for users with an older saved order.
 */
export function normalizeDashboardPreferences(value: Partial<DashboardPreferences> | null | undefined): DashboardPreferences {
  const defaults = createDefaultDashboardPreferences();
  const storedVisibleWidgets = uniqueKnownWidgetIds(value?.visible_widgets, defaults.visible_widgets);
  const storedOrder = uniqueKnownWidgetIds(value?.widget_order, defaults.widget_order);
  // A widget introduced after a user saved preferences should follow its
  // registry default. Existing widgets remain hidden when the user explicitly
  // disabled them: they are still present in the stored order.
  const visible_widgets = [
    ...storedVisibleWidgets,
    ...DASHBOARD_WIDGETS
      .filter((widget) =>
        widget.default_visible
        && storedOrder.indexOf(widget.id) === -1
        && storedVisibleWidgets.indexOf(widget.id) === -1,
      )
      .map((widget) => widget.id),
  ];
  const widget_order = [
    ...storedOrder,
    ...DASHBOARD_WIDGET_IDS.filter((id) => storedOrder.indexOf(id) === -1),
  ];
  const reminder_settings = { ...defaults.reminder_settings };

  if (value?.reminder_settings && typeof value.reminder_settings === "object") {
    for (const setting of DASHBOARD_REMINDER_SETTINGS) {
      const configuredValue = value.reminder_settings[setting.id];
      if (typeof configuredValue === "boolean") reminder_settings[setting.id] = configuredValue;
    }
  }

  return { visible_widgets, widget_order, reminder_settings };
}
