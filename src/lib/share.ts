import type { EventItem } from "@/lib/api";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Events without an end time are assumed to run three hours. */
const range = (e: EventItem) => {
  const start = new Date(e.start_date);
  const end = e.end_date ? new Date(e.end_date) : new Date(start.getTime() + 3 * 3600_000);
  return { start, end };
};

/** "Venue, City" — without repeating the city when the venue already ends in it. */
export const where = (e: Pick<EventItem, "location_name" | "city">) => {
  const venue = (e.location_name || "").trim();
  const city = (e.city || "").trim();
  return city && !venue.toLowerCase().endsWith(city.toLowerCase()) ? [venue, city].filter(Boolean).join(", ") : venue || city;
};

export const eventUrl = (e: EventItem) => `${window.location.origin}/e/${e.uuid}`;

export function googleCalendarUrl(e: EventItem): string {
  const { start, end } = range(e);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: `Tickets: ${eventUrl(e)}`,
    location: where(e),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** Downloads an .ics file — works for Apple Calendar, Outlook and most phones. */
export function downloadIcs(e: EventItem): void {
  const { start, end } = range(e);
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tikooh//Events//EN", "BEGIN:VEVENT",
    `UID:${e.uuid}@tikooh.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`, `LOCATION:${esc(where(e))}`, `URL:${eventUrl(e)}`,
    `DESCRIPTION:${esc(`Tickets: ${eventUrl(e)}`)}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `${e.title.replace(/[^\w]+/g, "-").slice(0, 60)}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function shareText(e: EventItem): string {
  const when = new Date(e.start_date).toLocaleString("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return `${e.title} — ${when}${where(e) ? `, ${where(e)}` : ""}. Get tickets: ${eventUrl(e)}`;
}

export const whatsappUrl = (e: EventItem) => `https://wa.me/?text=${encodeURIComponent(shareText(e))}`;
export const xUrl = (e: EventItem) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText(e))}`;

/** "in 3 days", "in 5 hours", "today" — null once it has started. */
export function startsIn(iso: string): string | null {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600_000);
  if (h < 1) return "in under an hour";
  if (h < 24) return `in ${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? "" : "s"}`;
}
