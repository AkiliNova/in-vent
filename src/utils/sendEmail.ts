import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase/firebase";

export interface EmailResult {
  sent: number;
  failed: string[];
}

async function getEmailConfig() {
  const snap = await getDoc(doc(db, "config", "email"));
  if (snap.exists()) return snap.data() as {
    proxyUrl: string; host: string; port: string;
    username: string; password: string; fromName: string; fromEmail: string;
  };
  return null;
}

export async function sendEmail(
  recipients: string[],
  subject: string,
  html: string,
  text?: string,
): Promise<EmailResult> {
  if (!recipients.length) throw new Error("No recipients");

  const config = await getEmailConfig();
  if (!config?.proxyUrl) throw new Error("Email not configured. Set credentials in Super Admin → Credentials.");

  const res = await fetch(config.proxyUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      to:        recipients,
      subject,
      html,
      text:      text ?? "",
      host:      config.host,
      port:      config.port,
      username:  config.username,
      password:  config.password,
      fromName:  config.fromName,
      fromEmail: config.fromEmail,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return { sent: data.sent ?? 0, failed: data.failed ?? [] };
}
