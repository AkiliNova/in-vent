import { Ticket, Users, Zap, TrendingUp } from 'lucide-react';

const MetricsSection = () => {
  const metrics = [
    { icon: Ticket, value: '50K+', label: 'Tickets Sold', color: 'text-[#F32B81]' },
    { icon: Users, value: '200+', label: 'Events Hosted', color: 'text-[#3ED2D1]' },
    { icon: Zap, value: '3s', label: 'QR Scan to Entry', color: 'text-[#F8D21F]' },
    { icon: TrendingUp, value: '95%', label: 'Organizer Satisfaction', color: 'text-primary' },
  ];

  return (
    <section className="py-16 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/50 to-background" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="glass rounded-2xl p-6 text-center hover:border-primary/30 transition-colors"
            >
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-secondary flex items-center justify-center">
                <metric.icon className={`w-6 h-6 ${metric.color}`} />
              </div>
              <div className={`text-4xl font-display font-bold mb-1 ${metric.color}`}>
                {metric.value}
              </div>
              <div className="text-muted-foreground text-sm">{metric.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default MetricsSection;
