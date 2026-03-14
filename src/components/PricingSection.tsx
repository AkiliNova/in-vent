import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

const plans = [
  {
    name: 'Free',
    price: '0',
    period: '',
    description: 'List your event at no upfront cost',
    features: [
      'Unlimited ticket tiers',
      'QR check-in scanning',
      'Guest management',
      'Basic analytics',
      'PDF ticket delivery',
    ],
    note: '10% platform fee per ticket sold',
    highlighted: false,
    cta: 'Get Started Free',
    href: '/onboarding',
  },
  {
    name: 'Organizer',
    price: 'KES 2,500',
    period: '/month',
    description: 'For active event organizers',
    features: [
      'Everything in Free',
      'Promo codes & discounts',
      'SMS campaigns',
      'Advanced analytics',
      'Payout dashboard',
      'Priority support',
    ],
    note: '5% platform fee per ticket sold',
    highlighted: true,
    cta: 'Start Selling',
    href: '/onboarding',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large-scale recurring events',
    features: [
      'Everything in Organizer',
      'White-label branding',
      'API access',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantee',
    ],
    note: 'Negotiated platform fee',
    highlighted: false,
    cta: 'Contact Sales',
    href: '/onboarding',
  },
];

const PricingSection = () => {
  return (
    <section id="pricing" className="py-24 relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-primary font-medium text-sm uppercase tracking-wider">Pricing</span>
          <h2 className="text-3xl md:text-5xl font-display font-bold text-foreground mt-4 mb-6">
            Simple, transparent{' '}
            <span className="gradient-text">pricing</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Start free. We only earn when you do — a small fee per ticket sold.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
              className={`relative rounded-3xl p-8 animate-slide-up ${
                plan.highlighted
                  ? 'card-gradient border-2 border-primary/50 shadow-xl shadow-primary/10'
                  : 'glass'
              }`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-sm font-medium rounded-full whitespace-nowrap">
                  Most Popular
                </div>
              )}

              <h3 className="text-xl font-display font-bold text-foreground mb-1">{plan.name}</h3>
              <p className="text-muted-foreground text-sm mb-6">{plan.description}</p>

              <div className="mb-2">
                <span className="text-4xl font-display font-bold text-foreground">{plan.price}</span>
                {plan.period && <span className="text-muted-foreground">{plan.period}</span>}
              </div>
              <p className="text-xs text-primary mb-8">{plan.note}</p>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-success" />
                    </div>
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.highlighted ? 'hero' : 'heroOutline'}
                className="w-full"
                asChild
              >
                <Link to={plan.href}>{plan.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
