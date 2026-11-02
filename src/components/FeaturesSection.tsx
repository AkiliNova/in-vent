import { Link } from "react-router-dom";
import {
  Ticket, Tag, Smartphone, ScanLine, UserPlus, BadgeCheck, Megaphone, Mail,
  Wallet, LineChart, ArrowRight, Check,
} from "lucide-react";

/**
 * The organiser pitch. Every line here describes something the product does
 * today; keep it that way when editing.
 */
const pillars = [
  {
    tag: "Sell",
    title: "Tickets that sell themselves",
    color: "#F32B81",
    items: [
      { icon: Ticket, text: "Early bird, Regular, VIP: any tiers, each with its own price and limit" },
      { icon: Smartphone, text: "M-Pesa checkout: buyers confirm on their phone in seconds" },
      { icon: Tag, text: "Promo codes and shareable discount links for fans, groups and influencers" },
    ],
  },
  {
    tag: "Run the door",
    title: "No clipboards, no queues",
    color: "#3ED2D1",
    items: [
      { icon: ScanLine, text: "Scan QR tickets with any phone. Each ticket gets in once, never twice" },
      { icon: UserPlus, text: "Sell at the gate too: cash, M-Pesa or complimentary guests" },
      { icon: BadgeCheck, text: "Live check-in count and guest list while the doors are open" },
    ],
  },
  {
    tag: "Grow",
    title: "Fill your next event faster",
    color: "#F8D21F",
    items: [
      { icon: Megaphone, text: "Email and SMS everyone who has been to your events before" },
      { icon: Mail, text: "Branded emails with your event's cover and a “Get tickets” button" },
      { icon: UserPlus, text: "Import guest lists from before Tikooh and reach them too" },
    ],
  },
  {
    tag: "Get paid",
    title: "Your money, on your phone",
    color: "#A78BFA",
    items: [
      { icon: Wallet, text: "Every sale lands in your wallet. Withdraw to M-Pesa within 24 hours" },
      { icon: LineChart, text: "Sales by day and by ticket type, as they happen" },
      { icon: Check, text: "Every shilling itemised: sale, fee, withdrawal" },
    ],
  },
];

const steps = [
  { n: "01", title: "Create your event", text: "Add a cover, ticket types and prices. Live in about five minutes." },
  { n: "02", title: "Share the link", text: "Post it anywhere. Fans pay with M-Pesa and get their QR ticket instantly." },
  { n: "03", title: "Scan & get paid", text: "Scan guests in at the door, then withdraw your earnings to M-Pesa." },
];

const FeaturesSection = () => (
  <section id="features" className="relative overflow-hidden py-24 md:py-32">
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <div className="absolute -right-40 top-40 h-[500px] w-[500px] rounded-full bg-[#F32B81]/[0.07] blur-[120px]" />
    </div>

    <div className="container relative mx-auto px-6">
      <div className="mx-auto mb-16 max-w-3xl text-center">
        <span className="text-sm font-medium uppercase tracking-wider text-primary">For organisers</span>
        <h2 className="mt-4 font-display text-4xl font-bold leading-tight text-foreground md:text-6xl">
          Sell out. <span className="gradient-text">Keep 90%.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Everything from the first ticket to the last payout in one place. No monthly fees, no setup costs. We only earn when you sell.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {pillars.map((p, i) => (
          <div key={p.tag} className="glass group relative overflow-hidden rounded-3xl p-7 transition-colors hover:border-white/20 md:p-8 animate-slide-up"
            style={{ animationDelay: `${i * 90}ms` }}>
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-20 blur-3xl transition-opacity group-hover:opacity-35"
              style={{ background: p.color }} />
            <span className="inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
              style={{ color: p.color, background: `${p.color}1A` }}>{p.tag}</span>
            <h3 className="mt-4 font-display text-2xl font-bold text-foreground">{p.title}</h3>
            <ul className="mt-6 space-y-4">
              {p.items.map((it) => (
                <li key={it.text} className="flex gap-3.5 text-[15px] leading-relaxed text-muted-foreground">
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: `${p.color}14` }}>
                    <it.icon className="h-4 w-4" style={{ color: p.color }} />
                  </span>
                  {it.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div id="how-it-works" className="mt-24">
        <h3 className="mb-12 text-center font-display text-3xl font-bold text-foreground md:text-4xl">Live in three steps</h3>
        <div className="relative grid gap-8 md:grid-cols-3">
          <div className="absolute left-[16%] right-[16%] top-8 hidden h-px bg-gradient-to-r from-[#F32B81]/40 via-[#3ED2D1]/40 to-[#F8D21F]/40 md:block" />
          {steps.map((s, i) => (
            <div key={s.n} className="relative text-center">
              <div className="relative z-10 mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-[#0d0d26] font-display text-xl font-bold"
                style={{ color: ["#F32B81", "#3ED2D1", "#F8D21F"][i] }}>{s.n}</div>
              <h4 className="text-lg font-semibold text-foreground">{s.title}</h4>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link to="/onboarding" className="inline-flex items-center gap-2 rounded-xl bg-[#F32B81] px-6 py-3 font-semibold text-white shadow-lg shadow-[#F32B81]/25 transition hover:bg-[#E02575]">
            Create your event, free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  </section>
);

export default FeaturesSection;
