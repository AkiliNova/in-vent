import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ArrowRight, Minus, Plus } from "lucide-react";

/** Matches TIKOOH_PLATFORM_FEE_PERCENT on the server. */
const FEE = 10;

const included = [
  "Unlimited events and ticket types",
  "M-Pesa checkout",
  "QR tickets by email and SMS",
  "Door scanner: every ticket gets in only once",
  "Gate sales and complimentary guests",
  "Promo codes and discount links",
  "Email and SMS campaigns to past guests",
  "Wallet with M-Pesa withdrawals within 24h",
];

const faqs = [
  {
    q: "Who pays the 10%?",
    a: "It comes out of each online ticket sale. Your buyers pay exactly the price you set, with no surprise booking fee at checkout.",
  },
  {
    q: "Is anything free?",
    a: "Yes. Free events cost nothing. Cash taken at the gate and complimentary tickets are never charged either. You only pay on tickets sold online.",
  },
  {
    q: "When do I get my money?",
    a: "Sales land in your wallet as they happen. Request a withdrawal any time (from KES 10) and it reaches your M-Pesa within 24 hours.",
  },
  {
    q: "Any monthly fee, setup fee or contract?",
    a: "None. Create your account, publish, and stop whenever you like.",
  },
  {
    q: "SMS campaigns?",
    a: "Email campaigns are included. Bulk SMS is priced per message, and you see the estimated cost before anything is sent.",
  },
];

const fmt = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

function Stepper({ label, value, set, step, min, max, prefix }: {
  label: string; value: number; set: (n: number) => void; step: number; min: number; max: number; prefix?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label className="text-sm text-muted-foreground">{label}</label>
        <span className="font-display text-xl font-bold text-foreground tabular-nums">{prefix}{value.toLocaleString("en-KE")}</span>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={`Less ${label}`} onClick={() => set(clamp(value - step))}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary hover:text-primary">
          <Minus className="h-4 w-4" />
        </button>
        <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
          onChange={(e) => set(Number(e.target.value))} className="h-2 flex-1 cursor-pointer accent-[#F32B81]" />
        <button type="button" aria-label={`More ${label}`} onClick={() => set(clamp(value + step))}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary hover:text-primary">
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

const PricingSection = () => {
  const [price, setPrice] = useState(1500);
  const [sold, setSold] = useState(300);
  const [open, setOpen] = useState<number | null>(0);

  const gross = price * sold;
  const fee = (gross * FEE) / 100;
  const net = gross - fee;

  return (
    <section id="pricing" className="relative overflow-hidden py-24 md:py-32">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-[#3ED2D1]/[0.06] blur-[140px]" />
      </div>

      <div className="container relative mx-auto px-6">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <span className="text-sm font-medium uppercase tracking-wider text-primary">Pricing</span>
          <h2 className="mt-4 font-display text-4xl font-bold text-foreground md:text-6xl">
            One plan. <span className="gradient-text">{FEE}% per ticket.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            No subscriptions, no setup fees, nothing for free events. If you don't sell, you don't pay.
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_1fr]">
          {/* ── The plan ── */}
          <div className="relative rounded-[28px] bg-gradient-to-br from-[#F32B81] via-[#A78BFA] to-[#3ED2D1] p-px shadow-2xl shadow-[#F32B81]/10">
            <div className="h-full rounded-[27px] bg-[#0b0b22] p-8 md:p-10">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                <span className="font-display text-7xl font-bold leading-none text-white">{FEE}%</span>
                <span className="pb-2 text-muted-foreground">of each ticket sold online</span>
              </div>
              <p className="mt-3 text-sm text-[#3ED2D1]">Free events, gate cash and comps: <strong>KES 0</strong></p>

              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {included.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-white/75">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#3ED2D1]/15">
                      <Check className="h-3 w-3 text-[#3ED2D1]" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Link to="/onboarding" className="inline-flex items-center gap-2 rounded-xl bg-[#F32B81] px-6 py-3 font-semibold text-white shadow-lg shadow-[#F32B81]/30 transition hover:bg-[#E02575]">
                  Start selling <ArrowRight className="h-4 w-4" />
                </Link>
                <span className="text-sm text-muted-foreground">
                  Selling 5,000+ tickets a year? <a href="mailto:info@tikooh.com?subject=Volume%20pricing" className="text-primary hover:underline">Ask about volume rates</a>
                </span>
              </div>
            </div>
          </div>

          {/* ── Calculator ── */}
          <div className="glass rounded-[28px] p-8 md:p-10">
            <h3 className="font-display text-2xl font-bold text-foreground">What you take home</h3>
            <p className="mt-1 text-sm text-muted-foreground">Drag to match your event.</p>

            <div className="mt-8 space-y-7">
              <Stepper label="Ticket price" prefix="KES " value={price} set={setPrice} step={100} min={100} max={20000} />
              <Stepper label="Tickets sold" value={sold} set={setSold} step={10} min={10} max={5000} />
            </div>

            <div className="mt-9 space-y-2.5 border-t border-border pt-6 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Ticket sales</span><span className="tabular-nums">{fmt(gross)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Tikooh fee ({FEE}%)</span><span className="tabular-nums">− {fmt(fee)}</span></div>
              <div className="flex items-end justify-between pt-3">
                <span className="font-medium text-foreground">To your M-Pesa</span>
                <span className="bg-gradient-to-r from-[#3ED2D1] to-[#A78BFA] bg-clip-text font-display text-4xl font-bold text-transparent tabular-nums">{fmt(net)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── FAQ ── */}
        <div className="mx-auto mt-16 max-w-3xl">
          <div className="divide-y divide-border rounded-2xl border border-border">
            {faqs.map((f, i) => (
              <div key={f.q}>
                <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-medium text-foreground transition hover:text-primary">
                  {f.q}
                  <Plus className={`h-4 w-4 flex-shrink-0 transition-transform duration-300 ${open === i ? "rotate-45 text-primary" : "text-muted-foreground"}`} />
                </button>
                <div className={`grid transition-all duration-300 ${open === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <p className="overflow-hidden px-6 text-sm leading-relaxed text-muted-foreground">
                    <span className="block pb-5">{f.a}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
