import { PlusCircle, CreditCard, ScanLine, BarChart2 } from 'lucide-react';

const steps = [
  {
    icon: PlusCircle,
    step: '01',
    title: 'Create Your Event',
    description: 'Sign up, set up ticket tiers with pricing and inventory, add images — go live in minutes.',
    color: 'text-[#F32B81]',
    border: 'group-hover:border-[#F32B81]/50',
    bg: 'group-hover:bg-[#F32B81]/10',
  },
  {
    icon: CreditCard,
    step: '02',
    title: 'Sell Tickets',
    description: 'Buyers pay via M-Pesa, Visa, or Mastercard through PesaPal. Instant PDF ticket delivered.',
    color: 'text-[#3ED2D1]',
    border: 'group-hover:border-[#3ED2D1]/50',
    bg: 'group-hover:bg-[#3ED2D1]/10',
  },
  {
    icon: ScanLine,
    step: '03',
    title: 'Scan & Check-In',
    description: 'Staff scans QR codes at the gate using any smartphone. Instant valid/invalid feedback.',
    color: 'text-[#F8D21F]',
    border: 'group-hover:border-[#F8D21F]/50',
    bg: 'group-hover:bg-[#F8D21F]/10',
  },
  {
    icon: BarChart2,
    step: '04',
    title: 'Track & Payout',
    description: 'Live revenue analytics, guest reports, and payout breakdown. Export to Excel anytime.',
    color: 'text-primary',
    border: 'group-hover:border-primary/50',
    bg: 'group-hover:bg-primary/10',
  },
];

const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-card/30 to-background" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <span className="text-primary font-medium text-sm uppercase tracking-wider">How it Works</span>
          <h2 className="text-3xl md:text-5xl font-display font-bold text-foreground mt-4 mb-6">
            Four steps to{' '}
            <span className="gradient-text">event excellence</span>
          </h2>
        </div>

        <div className="relative">
          {/* Connection line */}
          <div className="hidden lg:block absolute top-24 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div
                key={step.step}
                className="relative text-center group animate-slide-up"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <div className={`relative z-10 w-20 h-20 mx-auto mb-6 rounded-2xl bg-secondary border border-border flex items-center justify-center transition-all duration-300 ${step.border} ${step.bg}`}>
                  <step.icon className={`w-8 h-8 ${step.color}`} />
                </div>
                <div className={`font-mono text-sm mb-2 ${step.color} opacity-60`}>{step.step}</div>
                <h3 className="text-xl font-semibold text-foreground mb-3">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
