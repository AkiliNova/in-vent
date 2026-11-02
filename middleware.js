// Vercel Routing Middleware: link previews for event pages.
// Crawlers (WhatsApp, Facebook, X, Telegram…) don't run JavaScript, so they
// never see the SPA's per-event title/image. For those bots only, serve the
// API's preview page; everyone else gets the normal app.

export const config = { matcher: ["/e/:uuid*"] };

const API = "https://tikooh.78.159.110.138.nip.io/api";
const BOTS = /whatsapp|facebookexternalhit|facebot|meta-externalagent|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|skypeuripreview|pinterest|redditbot|applebot|googlebot|bingbot|embedly|iframely|viber|snapchat|signal|bot\b|crawler|spider|preview/i;

export default async function middleware(request) {
  if (!BOTS.test(request.headers.get("user-agent") || "")) return;

  const uuid = new URL(request.url).pathname.split("/")[2];
  if (!/^[0-9a-f-]{36}$/i.test(uuid || "")) return;

  try {
    const res = await fetch(`${API}/public/events/${uuid}/share`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return;

    return new Response(await res.text(), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=600" },
    });
  } catch {
    // API slow or down: fall through to the app's default tags.
  }
}
