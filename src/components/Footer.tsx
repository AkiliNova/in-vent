import { Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

const Footer = () => {
  const links = {
    Product: ['Features', 'Pricing', 'Integrations', 'API'],
    Company: ['About', 'Blog', 'Careers', 'Refund Policy'],
    Resources: ['Documentation', 'Help Center', 'Terms & Conditions', 'Status'],
    Legal: ['Privacy', 'Terms', 'Security', 'GDPR'],
  };

  return (
    <footer className="border-t border-border bg-card/50">
      <div className="container mx-auto px-6 py-16">
        <div className="grid md:grid-cols-6 gap-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <Link to="/" className="flex items-center gap-2">
                          <img
                            src="/assets/logo.png"
                            alt="IN-VENT Logo"
                            className="w-[200px] h-[60px] object-contain"
                          />
                        </Link>
            </div>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs">
                The smart event Ticketting booking andcheck-in system that turns chaotic clipboards 
                into seamless experiences.
            </p>
            <div className="flex gap-4">
              {['twitter', 'linkedin', 'github'].map((social) => (
                <a 
                  key={social}
                  href="#" 
                  className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center hover:bg-primary/20 transition-colors"
                >
                  <span className="sr-only">{social}</span>
                  <div className="w-4 h-4 bg-muted-foreground rounded-sm" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="font-semibold text-foreground mb-4">{category}</h4>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item}>
                    <a href="#" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-muted-foreground text-sm">
            © 2026 Tikooh. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-foreground transition-colors">Cookie Settings</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
