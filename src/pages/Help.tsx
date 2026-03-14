import { useState } from 'react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import {
  Ticket, CreditCard, ScanLine, Users, Tag, MessageSquare,
  ChevronDown, ChevronUp, Search, Mail, Phone, MessageCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const categories = [
  {
    icon: Ticket,
    label: 'Buying Tickets',
    color: 'text-[#F32B81]',
    bg: 'bg-[#F32B81]/10',
    faqs: [
      {
        q: 'How do I buy a ticket?',
        a: 'Browse events on the Events page, select the ticket tier you want, fill in your details, and pay via M-Pesa, Visa, or Mastercard through PesaPal. You\'ll receive a PDF ticket by email instantly.',
      },
      {
        q: 'How do I get my ticket after payment?',
        a: 'Your ticket is shown on the payment confirmation page with a QR code. You can download it as a PDF. You can also retrieve all your tickets anytime on the My Tickets page using your email address.',
      },
      {
        q: 'Can I use a promo code?',
        a: 'Yes — on the event page, enter your promo code before proceeding to payment. The discount will be applied automatically if the code is valid and hasn\'t expired.',
      },
      {
        q: 'What if I don\'t receive my ticket?',
        a: 'Visit the My Tickets page and enter the email you used when buying. If the payment was completed, your ticket will appear there. If it doesn\'t, contact our support team.',
      },
    ],
  },
  {
    icon: CreditCard,
    label: 'Payments',
    color: 'text-[#3ED2D1]',
    bg: 'bg-[#3ED2D1]/10',
    faqs: [
      {
        q: 'What payment methods are accepted?',
        a: 'We accept M-Pesa (STK push), Visa, and Mastercard. All payments are processed securely through PesaPal.',
      },
      {
        q: 'Is my payment information secure?',
        a: 'Yes. We never store your card details. All payment data is handled directly by PesaPal which is PCI-DSS compliant.',
      },
      {
        q: 'Can I get a refund?',
        a: 'Refund policies are set by individual event organizers. Please contact the event organizer directly. If you need help, reach out to our support team and we\'ll assist.',
      },
    ],
  },
  {
    icon: ScanLine,
    label: 'Check-In & Scanning',
    color: 'text-[#F8D21F]',
    bg: 'bg-[#F8D21F]/10',
    faqs: [
      {
        q: 'How does QR check-in work?',
        a: 'Show your ticket\'s QR code (PDF or on-screen) to the event staff. They scan it using the Tikooh scanner — you get a green checkmark and you\'re in. The whole process takes under 3 seconds.',
      },
      {
        q: 'What if the scanner can\'t read my QR code?',
        a: 'Staff can manually enter your ticket ID (shown on your ticket) into the scanner as a fallback. Make sure your screen brightness is turned up when presenting the QR code.',
      },
      {
        q: 'Can a ticket be used twice?',
        a: 'No. Once a ticket is scanned and validated, it\'s marked as checked-in and cannot be used again. This prevents duplicate entry.',
      },
    ],
  },
  {
    icon: Users,
    label: 'For Organizers',
    color: 'text-primary',
    bg: 'bg-primary/10',
    faqs: [
      {
        q: 'How do I create an event?',
        a: 'Sign up or log in, then go to the Events page and click "Create Event". Fill in the details, add ticket tiers with pricing and inventory, upload images, and publish.',
      },
      {
        q: 'When do I receive my payouts?',
        a: 'Payouts are processed after your event. You can view a full breakdown (gross revenue, platform fee, net payout) on the Payouts page. Contact us to initiate a withdrawal.',
      },
      {
        q: 'What is the platform fee?',
        a: 'We charge a 10% platform fee on each ticket sold. If you\'re on the Organizer plan (KES 2,500/month), the fee drops to 5%.',
      },
      {
        q: 'Can I create discount codes?',
        a: 'Yes — go to the Promo Codes page to create percent or fixed-amount discounts with expiry dates and usage limits.',
      },
      {
        q: 'How do I send a message to my guests?',
        a: 'Use the Campaigns page to send bulk SMS to all guests, checked-in attendees, pending guests, or VIPs. You can also message specific guests from the Guests page.',
      },
    ],
  },
  {
    icon: Tag,
    label: 'Promo Codes',
    color: 'text-[#F32B81]',
    bg: 'bg-[#F32B81]/10',
    faqs: [
      {
        q: 'How do I create a promo code?',
        a: 'Go to Promo Codes in your organizer dashboard. Click "New Code", set a code string, discount type (% or fixed KES), max uses, and expiry date.',
      },
      {
        q: 'Can a promo code be used unlimited times?',
        a: 'Only if you leave the "Max Uses" field blank when creating it. Otherwise it deactivates once the usage limit is reached.',
      },
    ],
  },
  {
    icon: MessageSquare,
    label: 'SMS Campaigns',
    color: 'text-[#3ED2D1]',
    bg: 'bg-[#3ED2D1]/10',
    faqs: [
      {
        q: 'Who can I send campaign messages to?',
        a: 'You can send to: All guests, Checked-In attendees, Pending (not yet arrived), or VIP guests. Select your audience on the Campaigns page.',
      },
      {
        q: 'Is there a cost for sending SMS?',
        a: 'SMS costs depend on your plan. Contact our team for current SMS rates for your region.',
      },
    ],
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      className="w-full text-left border-b border-border last:border-0 py-4"
      onClick={() => setOpen(!open)}
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`font-medium text-sm ${open ? 'text-primary' : 'text-foreground'} transition-colors`}>
          {q}
        </span>
        {open
          ? <ChevronUp className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        }
      </div>
      {open && (
        <p className="mt-3 text-muted-foreground text-sm leading-relaxed pr-8">{a}</p>
      )}
    </button>
  );
}

export default function HelpPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(categories[0].label);

  const active = categories.find(c => c.label === activeCategory)!;

  const filteredFaqs = search.trim()
    ? categories.flatMap(c => c.faqs.filter(f =>
        f.q.toLowerCase().includes(search.toLowerCase()) ||
        f.a.toLowerCase().includes(search.toLowerCase())
      ))
    : active.faqs;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="pt-24 pb-20">
        <div className="container mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-12">
            <span className="text-primary font-medium text-sm uppercase tracking-wider">Help Center</span>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mt-3 mb-4">
              How can we{' '}
              <span className="gradient-text">help you?</span>
            </h1>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Search our FAQ or browse by category below.
            </p>

            {/* Search */}
            <div className="relative max-w-lg mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search questions..."
                className="pl-11 rounded-full h-12 bg-secondary border-border"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {search.trim() ? (
            /* Search results */
            <div className="max-w-2xl mx-auto glass rounded-2xl p-6">
              <p className="text-sm text-muted-foreground mb-4">
                {filteredFaqs.length} result{filteredFaqs.length !== 1 ? 's' : ''} for "{search}"
              </p>
              {filteredFaqs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No results found. Try a different search term or{' '}
                  <a href="mailto:support@tikooh.com" className="text-primary hover:underline">contact support</a>.
                </p>
              ) : (
                filteredFaqs.map((faq, i) => <FAQItem key={i} q={faq.q} a={faq.a} />)
              )}
            </div>
          ) : (
            <div className="grid lg:grid-cols-4 gap-8">
              {/* Category sidebar */}
              <div className="lg:col-span-1">
                <div className="glass rounded-2xl p-4 space-y-1 sticky top-24">
                  {categories.map(cat => (
                    <button
                      key={cat.label}
                      onClick={() => setActiveCategory(cat.label)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-left transition-colors ${
                        activeCategory === cat.label
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg ${cat.bg} flex items-center justify-center flex-shrink-0`}>
                        <cat.icon className={`w-4 h-4 ${cat.color}`} />
                      </div>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* FAQ content */}
              <div className="lg:col-span-3">
                <div className="glass rounded-2xl p-6 md:p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`w-10 h-10 rounded-xl ${active.bg} flex items-center justify-center`}>
                      <active.icon className={`w-5 h-5 ${active.color}`} />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">{active.label}</h2>
                  </div>
                  {active.faqs.map((faq, i) => (
                    <FAQItem key={i} q={faq.q} a={faq.a} />
                  ))}
                </div>

                {/* Contact section */}
                <div className="grid sm:grid-cols-3 gap-4 mt-6">
                  <a
                    href="mailto:support@tikooh.com"
                    className="glass rounded-2xl p-6 hover:border-primary/30 transition-colors text-center group"
                  >
                    <Mail className="w-8 h-8 text-[#F32B81] mx-auto mb-3 group-hover:scale-110 transition-transform" />
                    <h3 className="font-semibold text-foreground mb-1">Email Us</h3>
                    <p className="text-muted-foreground text-xs">support@tikooh.com</p>
                    <p className="text-muted-foreground text-xs mt-1">Reply within 24 hours</p>
                  </a>
                  <a
                    href="tel:+254700000000"
                    className="glass rounded-2xl p-6 hover:border-primary/30 transition-colors text-center group"
                  >
                    <Phone className="w-8 h-8 text-[#3ED2D1] mx-auto mb-3 group-hover:scale-110 transition-transform" />
                    <h3 className="font-semibold text-foreground mb-1">Call Us</h3>
                    <p className="text-muted-foreground text-xs">+254 700 000 000</p>
                    <p className="text-muted-foreground text-xs mt-1">Mon–Fri, 9am–6pm EAT</p>
                  </a>
                  <a
                    href="https://wa.me/254700000000"
                    target="_blank"
                    rel="noreferrer"
                    className="glass rounded-2xl p-6 hover:border-primary/30 transition-colors text-center group"
                  >
                    <MessageCircle className="w-8 h-8 text-[#F8D21F] mx-auto mb-3 group-hover:scale-110 transition-transform" />
                    <h3 className="font-semibold text-foreground mb-1">WhatsApp</h3>
                    <p className="text-muted-foreground text-xs">+254 700 000 000</p>
                    <p className="text-muted-foreground text-xs mt-1">Fastest response</p>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
