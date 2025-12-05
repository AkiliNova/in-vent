import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

const PricingSection = () => {
  const plans = [
    {
      name: 'Starter',
      price: '49',
      period: '/event',
      description: 'Perfect for small gatherings and meetups',
      features: [
        'Up to 100 guests',
        'QR check-in',
        'Basic dashboard',
        'Email support',
        'Export to CSV',
      ],
      highlighted: false,
    },
    {
      name: 'Professional',
      price: '149',
      period: '/event',
      description: 'For conferences and corporate events',
      features: [
        'Up to 1,000 guests',
        'All Starter features',
        'SMS campaigns',
        'Real-time analytics',
        'Badge printing',
        'Geofencing',
        'Priority support',
      ],
      highlighted: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      description: 'For large-scale recurring events',
      features: [
        'Unlimited guests',
        'All Professional features',
        'White-label branding',
        'API access',
        'SSO integration',
        'Dedicated success manager',
        'SLA guarantee',
      ],
      highlighted: false,
    },
  ];

  return (
    <section id="pricing" className="py-24 relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-primary font-medium text-sm uppercase tracking-wider">Pricing</span>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mt-4 mb-6">
            Simple, transparent{' '}
            <span className="gradient-text">pricing</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            No hidden fees. No per-scan charges. Just predictable pricing that scales with your events.
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
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-sm font-medium rounded-full">
                  Most Popular
                </div>
              )}
              
              <h3 className="text-xl font-semibold text-foreground mb-2">{plan.name}</h3>
              <p className="text-muted-foreground text-sm mb-6">{plan.description}</p>
              
              <div className="mb-8">
                <span className="text-4xl font-bold text-foreground">
                  {plan.price === 'Custom' ? '' : '$'}{plan.price}
                </span>
                <span className="text-muted-foreground">{plan.period}</span>
              </div>
              
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
              >
                {plan.price === 'Custom' ? 'Contact Sales' : 'Get Started'}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
