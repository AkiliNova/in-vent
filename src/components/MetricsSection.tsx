import { Clock, Zap, Target, MessageSquare } from 'lucide-react';
import MetricCard from './MetricCard';

const MetricsSection = () => {
  const metrics = [
    { icon: Clock, value: '30s', label: 'Registration time' },
    { icon: Zap, value: '3s', label: 'QR scan to badge' },
    { icon: Target, value: '95%', label: 'Data completeness' },
    { icon: MessageSquare, value: '25%', label: 'SMS click-through' },
  ];

  return (
    <section className="py-20 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/50 to-background" />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Built for <span className="gradient-text">performance</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Every second counts at your event. Our system is engineered for speed and reliability.
          </p>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {metrics.map((metric, index) => (
            <MetricCard
              key={metric.label}
              icon={metric.icon}
              value={metric.value}
              label={metric.label}
              delay={index * 100}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default MetricsSection;
