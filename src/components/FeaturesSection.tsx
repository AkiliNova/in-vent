import {
  QrCode,
  BarChart3,
  MessageCircle,
  Shield,
  Ticket,
  Tag,
  Users,
  Wallet,
} from 'lucide-react';

const features = [
  {
    icon: Ticket,
    title: 'Ticket Tiers',
    description: 'Create Early Bird, VIP, and Regular tiers with individual pricing and inventory limits.',
    color: 'text-[#F32B81]',
    bg: 'bg-[#F32B81]/10',
  },
  {
    icon: QrCode,
    title: 'QR Check-In',
    description: 'Real camera-based QR scanning on any device. Green/red instant validation with guest name.',
    color: 'text-[#3ED2D1]',
    bg: 'bg-[#3ED2D1]/10',
  },
  {
    icon: BarChart3,
    title: 'Live Analytics',
    description: 'Real-time revenue charts, ticket-by-tier breakdown, and attendee demographics.',
    color: 'text-[#F8D21F]',
    bg: 'bg-[#F8D21F]/10',
  },
  {
    icon: MessageCircle,
    title: 'SMS Campaigns',
    description: 'Blast targeted messages to all guests, checked-in, pending, or VIPs in one click.',
    color: 'text-primary',
    bg: 'bg-primary/10',
  },
  {
    icon: Tag,
    title: 'Promo Codes',
    description: 'Percent or fixed discounts with expiry dates and usage caps. Track redemptions live.',
    color: 'text-[#F32B81]',
    bg: 'bg-[#F32B81]/10',
  },
  {
    icon: Users,
    title: 'Guest Management',
    description: 'Full guest list with check-in status, bulk messaging, and CSV/Excel export.',
    color: 'text-[#3ED2D1]',
    bg: 'bg-[#3ED2D1]/10',
  },
  {
    icon: Wallet,
    title: 'Payout Tracking',
    description: 'Per-event revenue breakdown with gross, platform fee, and net payout calculation.',
    color: 'text-[#F8D21F]',
    bg: 'bg-[#F8D21F]/10',
  },
  {
    icon: Shield,
    title: 'Secure Payments',
    description: 'PesaPal integration — M-Pesa, Visa, Mastercard. Instant confirmation and PDF tickets.',
    color: 'text-primary',
    bg: 'bg-primary/10',
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="py-24 relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-primary font-medium text-sm uppercase tracking-wider">Features</span>
          <h2 className="text-3xl md:text-5xl font-display font-bold text-foreground mt-4 mb-6">
            Everything you need,{' '}
            <span className="gradient-text">nothing you don't</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            From ticket sales to post-event payouts — manage the entire journey from one platform.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="glass rounded-2xl p-6 hover:border-primary/30 transition-all duration-300 animate-slide-up group"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className={`w-12 h-12 rounded-xl ${feature.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <feature.icon className={`w-6 h-6 ${feature.color}`} />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
