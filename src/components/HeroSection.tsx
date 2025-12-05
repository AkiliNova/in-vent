import { Button } from '@/components/ui/button';
import { ArrowRight, Play } from 'lucide-react';
import QRVisualization from './QRVisualization';

const HeroSection = () => {
  return (
    <section className="relative min-h-screen pt-32 pb-20 overflow-hidden hero-gradient">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left content */}
          <div className="animate-slide-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-8">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Now with offline-first architecture
            </div>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight mb-6">
              Event check-in,{' '}
              <span className="gradient-text">reimagined</span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-10 max-w-xl leading-relaxed">
              Self-register in 30 seconds. Scan in 3. Real-time dashboards, instant SMS reach, 
              and zero clipboard chaos—all from a $40 tablet at the door.
            </p>
            
            <div className="flex flex-wrap gap-4 mb-12">
              <Button variant="hero" size="xl">
                Start Free Trial
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Button variant="heroOutline" size="xl">
                <Play className="w-5 h-5" />
                Watch Demo
              </Button>
            </div>
            
            <div className="flex items-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                No credit card
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                GDPR compliant
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Setup in minutes
              </div>
            </div>
          </div>
          
          {/* Right content - QR visualization */}
          <div className="relative animate-fade-in" style={{ animationDelay: '300ms' }}>
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent rounded-3xl" />
            <div className="animate-float">
              <QRVisualization />
            </div>
            
            {/* Floating stats */}
            <div className="absolute -left-4 top-1/4 glass rounded-xl px-4 py-3 animate-slide-up" style={{ animationDelay: '500ms' }}>
              <div className="text-2xl font-bold text-success">3s</div>
              <div className="text-xs text-muted-foreground">Scan time</div>
            </div>
            
            <div className="absolute -right-4 bottom-1/4 glass rounded-xl px-4 py-3 animate-slide-up" style={{ animationDelay: '700ms' }}>
              <div className="text-2xl font-bold text-primary">95%</div>
              <div className="text-xs text-muted-foreground">Data accuracy</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
