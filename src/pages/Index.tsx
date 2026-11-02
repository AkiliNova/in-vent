import Navigation from '@/components/Navigation';
import HeroSection from '@/components/HeroSection';
import FeaturesSection from '@/components/FeaturesSection';
import PricingSection from '@/components/PricingSection';
import CTASection from '@/components/CTASection';
import Footer from '@/components/Footer';
import UpcomingEvents from '@/components/UpcomingEvents';

const Index = () => (
  <div className="min-h-screen bg-background">
    <Navigation />
    <main>
      <HeroSection />
      <UpcomingEvents />
      <FeaturesSection />
      <PricingSection />
      <CTASection />
    </main>
    <Footer />
  </div>
);

export default Index;
