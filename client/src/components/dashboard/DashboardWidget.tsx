import type { CSSProperties, ReactNode } from "react";

interface DashboardWidgetProps {
  id: string;
  visible: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Common visibility boundary for persisted dashboard widgets. Keeping it
 * layout-neutral lets existing widget internals retain their proven layout.
 */
export function DashboardWidget({ id, visible, className, style, children }: DashboardWidgetProps) {
  if (!visible) return null;

  return (
    <section className={className} style={style} data-dashboard-widget={id}>
      {children}
    </section>
  );
}
