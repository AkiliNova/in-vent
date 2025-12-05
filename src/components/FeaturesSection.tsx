import { 
  QrCode, 
  BarChart3, 
  MessageCircle, 
  Shield, 
  MapPin, 
  Wifi, 
  Users, 
  Gift 
} from 'lucide-react';
import FeatureCard from './FeatureCard';

const FeaturesSection = () => {
  const features = [
    {
      icon: QrCode,
      title: 'Self-Service Registration',
      description: 'Pre-event link sends guests to a 4-field form. QR pass auto-adds to Apple/Google Wallet—no app download needed.',
    },
    {
      icon: BarChart3,
      title: 'Real-Time Dashboard',
      description: 'Live headcount per room, VIP arrivals, and capacity alerts. Auto-lock doors when limits are reached.',
    },
    {
      icon: MessageCircle,
      title: 'Instant SMS Campaigns',
      description: 'One-click messages to specific segments: "all who left early" or "VIPs that no-showed." 25% avg CTR.',
    },
    {
      icon: Shield,
      title: 'GDPR & Audit Ready',
      description: 'Time-stamped entry/exit logs, signed waivers, opt-in proof. One-click data export and delete.',
    },
    {
      icon: MapPin,
      title: 'Skip-the-Line Geofencing',
      description: 'When a phone enters 200m of venue, staff gets notified. Guest walks to Fast Lane—badge ready.',
    },
    {
      icon: Wifi,
      title: 'Offline-First Mode',
      description: 'SQLite queues scans when Wi-Fi drops. Auto-syncs when back online. Zero data loss guaranteed.',
    },
    {
      icon: Users,
      title: 'Excluded-Party Screening',
      description: 'Instant check against internal ban lists before QR issuance. Keep your events safe.',
    },
    {
      icon: Gift,
      title: 'Sponsor Monetization',
      description: 'SMS footer ads like "Free drink courtesy of ACME" boost sponsor ROI and offset platform costs.',
    },
  ];

  return (
    <section id="features" className="py-24 relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-primary font-medium text-sm uppercase tracking-wider">Features</span>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mt-4 mb-6">
            Everything you need,{' '}
            <span className="gradient-text">nothing you don't</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            From registration to post-event follow-up, manage the entire guest journey 
            from a single platform.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              delay={index * 100}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
