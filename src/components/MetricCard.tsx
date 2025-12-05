import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  icon: LucideIcon;
  value: string;
  label: string;
  delay?: number;
}

const MetricCard = ({ icon: Icon, value, label, delay = 0 }: MetricCardProps) => {
  return (
    <div 
      className="glass rounded-2xl p-6 text-center group hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <div className="text-4xl font-bold gradient-text mb-2">{value}</div>
      <div className="text-muted-foreground text-sm">{label}</div>
    </div>
  );
};

export default MetricCard;
