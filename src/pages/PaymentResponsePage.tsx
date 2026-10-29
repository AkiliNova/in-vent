import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Navigation from "@/components/Navigation";
import { api } from "@/lib/api";

interface Status {
  status: string;
  event: { uuid: string; title: string };
  tickets: { code: string }[];
}

/** Where Pesapal sends buyers back to. The API confirms with the provider. */
export default function PaymentResponsePage() {
  const [params] = useSearchParams();
  const reference = params.get("OrderMerchantReference") || params.get("reference");
  const [s, setS] = useState<Status | null>(null);

  useEffect(() => {
    if (!reference) return;
    let tries = 0;
    const tick = () => api.get<Status>(`public/orders/${reference}`).then((r) => {
      setS(r);
      if (r.status === "pending" && ++tries < 40) timer = window.setTimeout(tick, 3000);
    }).catch(() => {});
    let timer = window.setTimeout(tick, 0);
    return () => window.clearTimeout(timer);
  }, [reference]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-28 px-4">
        <div className="container mx-auto max-w-md glass rounded-2xl p-6 text-center space-y-4">
          {!reference ? <p className="text-muted-foreground">No order reference in this link.</p>
            : !s || s.status === "pending" ? (
              <><Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" /><p className="text-muted-foreground">Confirming your payment…</p></>
            ) : s.status === "paid" ? (
              <>
                <CheckCircle2 className="w-10 h-10 text-success mx-auto" />
                <h1 className="text-2xl font-bold text-foreground">You're going to {s.event.title}</h1>
                <div className="grid grid-cols-2 gap-3">
                  {s.tickets.map((t) => (
                    <div key={t.code} className="bg-white rounded-xl p-3"><QRCodeSVG value={t.code} size={110} className="mx-auto" />
                      <div className="font-mono text-[10px] text-black mt-1 break-all">{t.code}</div></div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <XCircle className="w-10 h-10 text-destructive mx-auto" />
                <h1 className="text-xl font-bold text-foreground">Payment {s.status}</h1>
                <Link to={`/e/${s.event.uuid}`} className="text-primary hover:underline">Try again</Link>
              </>
            )}
        </div>
      </main>
    </div>
  );
}
