/**
 * SMS part counting — mirrors backend App\Services\Sms\SmsMessage so the
 * counter under the message box agrees with what the server bills.
 */
const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

/** Lookalikes that silently force Unicode, and the plain character to use instead. */
export const SMS_REPLACEMENTS: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "“": '"', "”": '"', "„": '"',
  "–": "-", "—": "-", "…": "...", " ": " ", "•": "-", "·": "-",
};

export interface SmsAnalysis {
  encoding: "GSM-7" | "UCS-2";
  characters: number;
  segments: number;
  perSegment: number;
  /** Characters left before the next part starts costing extra. */
  remaining: number;
  unicodeChars: string[];
  /** True when every Unicode character has a plain replacement. */
  fixable: boolean;
}

export function analyseSms(text: string): SmsAnalysis {
  const chars = Array.from(text);
  const unicode = new Set<string>();
  let units = 0;

  for (const c of chars) {
    if (GSM7.includes(c)) units += 1;
    else if (GSM7_EXT.includes(c)) units += 2;
    else unicode.add(c);
  }

  // UCS-2 counts UTF-16 code units: JS string length already is that.
  if (unicode.size) units = text.length;
  const single = unicode.size ? 70 : 160;
  const multi = unicode.size ? 67 : 153;
  const segments = units === 0 ? 1 : units <= single ? 1 : Math.ceil(units / multi);
  const capacity = segments === 1 ? single : segments * multi;

  return {
    encoding: unicode.size ? "UCS-2" : "GSM-7",
    characters: units,
    segments,
    perSegment: segments > 1 ? multi : single,
    remaining: Math.max(0, capacity - units),
    unicodeChars: [...unicode].slice(0, 20),
    fixable: unicode.size > 0 && [...unicode].every((c) => c in SMS_REPLACEMENTS),
  };
}

/** Swap curly quotes, dashes and the like for GSM-7 equivalents. */
export const toGsm = (text: string) => Array.from(text).map((c) => SMS_REPLACEMENTS[c] ?? c).join("");

export type Source = "all" | "event" | "platform";

export interface AudienceFilter {
  source: Source;
  event_ids?: number[];
  tenant_ids?: number[];
  ticket_tier_id?: number[];
  category?: string[];
  status?: string[];
  attendance?: "checked_in" | "no_show";
  paid?: "paid" | "free";
  consent?: boolean;
  country?: string[];
  registered_from?: string;
  registered_to?: string;
  event_from?: string;
  event_to?: string;
  q?: string;
  include?: string[];
  exclude?: string[];
  include_contacts?: boolean;
  /** Legacy: older campaigns saved this instead of attendance. */
  checked_in?: boolean;
}

export type PersonState = "ok" | "invalid" | "unsupported" | "blocked" | "duplicate" | "suppressed" | "missing";

export interface AudienceSummary {
  recipient_count: number;
  states: Record<PersonState, number>;
  skipped: number;
  networks: Record<string, number>;
  monitor_count: number;
  monitor_numbers: string[];
  credits: number;
  max_segments: number;
  segments_per_message: number;
  encoding: "GSM-7" | "UCS-2" | null;
  characters: number | null;
  unicode_chars: string[];
  cost_per_segment: number;
  estimated_cost: number;
  sample: { name: string; destination: string }[];
}

export interface AudiencePerson {
  key: string;
  attendee_id: number | null;
  contact_id: number | null;
  event_id: number | null;
  event: string | null;
  raw: string | null;
  destination: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  state: PersonState;
  network: string | null;
  reason: string | null;
  segments: number;
}

export interface SmsStatus {
  provider: "africastalking" | "advanta";
  provider_label: string;
  configured: boolean;
  cost_per_segment: number;
  currency: string;
  /** The signed-in user's remembered confirmation numbers. */
  monitor_numbers: string[];
  sandbox?: boolean;
  sender_id?: string | null;
  countries?: string;
  flagged_numbers?: number;
  balance?: { ok: boolean; currency: string | null; amount: number | null; error: string | null } | null;
}

export const STATE_LABEL: Record<PersonState, string> = {
  ok: "Will receive",
  invalid: "Invalid number",
  unsupported: "Unsupported",
  blocked: "Blocked by provider",
  duplicate: "Duplicate",
  suppressed: "Opted out",
  missing: "No contact",
};

export const STATE_STYLE: Record<PersonState, string> = {
  ok: "bg-success/15 text-success",
  invalid: "bg-destructive/15 text-destructive",
  unsupported: "bg-orange-500/15 text-orange-500",
  blocked: "bg-destructive/15 text-destructive",
  duplicate: "bg-muted text-muted-foreground",
  suppressed: "bg-muted text-muted-foreground",
  missing: "bg-muted text-muted-foreground",
};

/** Number of narrowing filters in use (for the "Refine (3)" badge). */
export function activeFilters(f: AudienceFilter): number {
  return [
    f.tenant_ids?.length, f.ticket_tier_id?.length, f.category?.length, f.status?.length, f.country?.length,
    f.attendance, f.paid, f.consent, f.registered_from || f.registered_to, f.event_from || f.event_to, f.q?.trim(),
  ].filter(Boolean).length;
}
