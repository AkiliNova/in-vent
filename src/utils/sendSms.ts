import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase/firebase";

export interface SmsResult {
  sent: number;
  failed: string[];
}

/** Fetches SMS proxy config from Firestore config/sms */
async function getSmsConfig() {
  const snap = await getDoc(doc(db, "config", "sms"));
  if (snap.exists()) return snap.data() as { proxyUrl: string; apiKey: string; partnerID: string; shortcode: string };
  // Fallback to env
  return {
    proxyUrl:  import.meta.env.VITE_ADVANTA_SMS_URL as string || "",
    apiKey:    "",
    partnerID: "",
    shortcode: "",
  };
}

export async function sendSms(recipients: string[], message: string): Promise<SmsResult> {
  if (!recipients.length) throw new Error("No recipients");

  const config = await getSmsConfig();
  if (!config.proxyUrl) throw new Error("SMS not configured. Set credentials in Super Admin → Credentials.");

  const res = await fetch(config.proxyUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ recipients, message, apiKey: config.apiKey, partnerID: config.partnerID, shortcode: config.shortcode }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return { sent: data.sent ?? 0, failed: data.failed ?? [] };
}
