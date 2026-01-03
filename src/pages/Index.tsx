import Navigation from '@/components/Navigation';
import HeroSection from '@/components/HeroSection';
import MetricsSection from '@/components/MetricsSection';
import FeaturesSection from '@/components/FeaturesSection';
import HowItWorksSection from '@/components/HowItWorksSection';
import PricingSection from '@/components/PricingSection';
import CTASection from '@/components/CTASection';
import Footer from '@/components/Footer';
import UpcomingEvents from '@/components/UpcomingEvents';
import { mockEvents } from '@/data/mockEvents';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
          <HeroSection />
        {/* <MetricsSection /> */}
        {/* <FeaturesSection /> */}
        <UpcomingEvents />
        {/* <HowItWorksSection />
        <PricingSection /> */}
        <CTASection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
