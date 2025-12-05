import { Send, Smartphone, ScanLine, BarChart2 } from 'lucide-react';

const HowItWorksSection = () => {
  const steps = [
    {
      icon: Send,
      step: '01',
      title: 'Send Invites',
      description: 'Import your guest list or let visitors self-register. Each gets a unique link via email or SMS.',
    },
    {
      icon: Smartphone,
      step: '02',
      title: 'Guests Register',
      description: '30-second form captures name, contact, and preferences. QR pass saved to phone wallet instantly.',
    },
    {
      icon: ScanLine,
      step: '03',
      title: 'Scan & Check-In',
      description: 'Staff scans QR on any tablet. Green checkmark + name badge prints in 3 seconds flat.',
    },
    {
      icon: BarChart2,
      step: '04',
      title: 'Analyze & Engage',
      description: 'Live dashboards track attendance. Post-event SMS campaigns drive sponsor ROI.',
    },
  ];

  return (
    <section id="how-it-works" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-card/30 to-background" />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <span className="text-primary font-medium text-sm uppercase tracking-wider">How it Works</span>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mt-4 mb-6">
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
                {/* Step number */}
                <div className="relative z-10 w-20 h-20 mx-auto mb-6 rounded-2xl bg-secondary border border-border flex items-center justify-center group-hover:border-primary/50 group-hover:bg-primary/10 transition-all duration-300">
                  <step.icon className="w-8 h-8 text-primary" />
                </div>
                
                <div className="font-mono text-primary/60 text-sm mb-2">{step.step}</div>
                <h3 className="text-xl font-semibold text-foreground mb-3">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
