import { Badge } from "@/components/ui/badge";

const LABELS: Record<string, string> = {
  wise: "Wise",
  remitly: "Remitly",
  western_union: "Western Union",
  bank_wire: "Bank wire",
  other: "Other",
};

/**
 * Service-label chip. Shared badge chrome (secondary variant) for every
 * service — no service-specific color coding. Lavender accent stays
 * reserved for active/selected states across the app (DESIGN.md accent
 * restraint rule).
 */
export function ServiceBadge({ service }: { service: string }) {
  return (
    <Badge variant="secondary" className="text-[10px] font-[600] uppercase tracking-[0.06em]">
      {LABELS[service] ?? service}
    </Badge>
  );
}

export function serviceLabel(s: string): string {
  return LABELS[s] ?? s;
}
