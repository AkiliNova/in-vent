import { Button } from '@/components/ui/button';
import { ArrowRight, Zap } from 'lucide-react';

const CTASection = () => {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-8">
            <Zap className="w-4 h-4" />
            Ready to transform your events?
          </div>
          
          <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
            Stop the clipboard chaos.{' '}
            <span className="gradient-text">Start today.</span>
          </h2>
          
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Join thousands of event organizers who've made the switch. 
            Set up takes minutes, not days.
          </p>
          
          <div className="flex flex-wrap justify-center gap-4">
            <Button variant="hero" size="xl">
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button variant="heroOutline" size="xl">
              Schedule Demo
            </Button>
          </div>
          
          <p className="text-sm text-muted-foreground mt-8">
            14-day free trial • No credit card required • Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
