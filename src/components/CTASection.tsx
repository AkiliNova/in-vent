import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const CTASection = () => (
  <section className="relative px-6 py-24">
    <div className="container mx-auto">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[36px] border border-white/10 bg-[#0b0b22] px-8 py-16 text-center md:px-16 md:py-20">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 -top-24 h-80 w-80 rounded-full bg-[#F32B81]/25 blur-[100px]" />
          <div className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-[#3ED2D1]/20 blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.05]"
            style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        </div>

        <div className="relative">
          <h2 className="font-display text-4xl font-bold leading-tight text-white md:text-6xl">
            Your next event
            <br />
            <span className="bg-gradient-to-r from-[#F32B81] via-[#FF7AB6] to-[#F8D21F] bg-clip-text text-transparent">deserves a full house.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/60">
            Set up in minutes. Sell with M-Pesa tonight. Get paid within 24 hours.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/onboarding" className="inline-flex items-center gap-2 rounded-xl bg-[#F32B81] px-7 py-3.5 font-semibold text-white shadow-lg shadow-[#F32B81]/30 transition hover:bg-[#E02575]">
              Create your event <ArrowRight className="h-5 w-5" />
            </Link>
            <Link to="/search-events" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 font-semibold text-white transition hover:bg-white/10">
              Find something to do
            </Link>
          </div>

          <p className="mt-8 text-sm text-white/40">Free to list · 10% only when you sell · No contracts</p>
        </div>
      </div>
    </div>
  </section>
);

export default CTASection;
