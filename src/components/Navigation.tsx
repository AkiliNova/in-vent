"use client";

import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, QrCode, ScanLine, Users, MessageSquare, Settings,
  Menu, X, House, LogOut
} from 'lucide-react';
import { auth } from "@/firebase/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

const sports = ["Football", "Basketball", "Rugby", "Athletics", "Cricket"];
const counties = [
  "Nairobi", "Mombasa", "Kisumu", "Nakuru", "Kajiado", "Machakos",
  "Kiambu", "Bungoma", "Meru", "Eldoret"
];

const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [openSports, setOpenSports] = useState(false);
  const [openCities, setOpenCities] = useState(false);

  // Landing page detection
  const isLanding = [
    '/',
    '/search-events'
  ].includes(location.pathname) || location.pathname.startsWith('/events');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/admin/login');
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const navLinks = isLanding
    ? [
        { href: '/search-events', label: 'Events' },
        { href: '#sport', label: 'Sports' }, // Placeholder for dropdown
        { href: '#cities', label: 'Cities' }, // Placeholder for dropdown
        { href: '#help', label: 'Help' },
        { href: '#blog', label: 'Blog' },
      ]
    : [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/register', label: 'Register', icon: QrCode },
        { href: '/fields', label: 'Fields', icon: LayoutDashboard },
        { href: '/scanner', label: 'Scanner', icon: ScanLine },
        { href: '/guests', label: 'Guests', icon: Users },
        { href: '/campaigns', label: 'Campaigns', icon: MessageSquare },
        { href: '/events', label: 'Events', icon: House },
        { href: '/settings', label: 'Settings', icon: Settings },
      ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/assets/logo.png"
              alt="IN-VENT Logo"
              className="w-[200px] h-[60px] object-contain"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.href;
              const Icon = 'icon' in link ? link.icon : null;

              // Skip placeholder dropdown links
              if (link.href === '#sport' || link.href === '#cities') return null;

              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    isActive ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {link.label}
                </Link>
              );
            })}

            {/* Sports Dropdown */}
            <div className="relative" onMouseEnter={() => setOpenSports(true)} onMouseLeave={() => setOpenSports(false)}>
              <button className="px-4 py-2 rounded-lg hover:bg-secondary">
                Sports
              </button>
              {openSports && (
                <div className="absolute top-full left-0 mt-1 w-40 bg-background border border-border rounded-lg shadow-lg z-50">
                  {sports.map(sport => (
                    <button
                      key={sport}
                      className="block w-full text-left px-4 py-2 hover:bg-primary/20"
                      onClick={() => navigate(`/search-events?type=${encodeURIComponent(sport)}`)}
                    >
                      {sport}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cities Dropdown */}
            <div className="relative" onMouseEnter={() => setOpenCities(true)} onMouseLeave={() => setOpenCities(false)}>
              <button className="px-4 py-2 rounded-lg hover:bg-secondary">
                Cities
              </button>
              {openCities && (
                <div className="absolute top-full left-0 mt-1 w-40 bg-background border border-border rounded-lg shadow-lg z-50">
                  {counties.map(city => (
                    <button
                      key={city}
                      className="block w-full text-left px-4 py-2 hover:bg-primary/20"
                      onClick={() => navigate(`/search-events?city=${encodeURIComponent(city)}`)}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Logout Button */}
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 ml-2"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" /> Logout
              </Button>
            )}

            {/* Landing Sign In / Dashboard */}
            {isLanding && !user && (
              <Button variant="ghost" size="sm" className="ml-2">
                <Link to="/admin/login">Sign In</Link>
              </Button>
            )}
            {isLanding && user && (
              <Button variant="ghost" size="sm" className="ml-2">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            )}
          </div>

          {/* Top-right buttons + mobile menu */}
          <div className="flex items-center gap-3">
            {isLanding && (
              <Button
                variant="hero"
                size="sm"
                asChild
                className="bg-[#F32B81] hover:bg-[#E02575] text-white hidden md:inline-flex"
              >
                <Link to={user ? "/dashboard" : "/onboarding"}>Sell Your Event</Link>
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden pt-4 pb-2 border-t border-border mt-4 space-y-2">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.href;
              const Icon = 'icon' in link ? link.icon : null;

              // Skip dropdown placeholders in mobile (we handle below)
              if (link.href === '#sport' || link.href === '#cities') return null;

              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {Icon && <Icon className="w-5 h-5" />}
                  {link.label}
                </Link>
              );
            })}

            {/* Mobile Sports */}
            <div className="flex flex-col">
              <span className="px-4 py-2 font-medium text-foreground">Sports</span>
              {sports.map(sport => (
                <button
                  key={sport}
                  className="text-left px-6 py-2 hover:bg-primary/20 rounded"
                  onClick={() => {
                    navigate(`/search-events?type=${encodeURIComponent(sport)}`);
                    setMobileMenuOpen(false);
                  }}
                >
                  {sport}
                </button>
              ))}
            </div>

            {/* Mobile Cities */}
            <div className="flex flex-col">
              <span className="px-4 py-2 font-medium text-foreground">Cities</span>
              {counties.map(city => (
                <button
                  key={city}
                  className="text-left px-6 py-2 hover:bg-primary/20 rounded"
                  onClick={() => {
                    navigate(`/search-events?city=${encodeURIComponent(city)}`);
                    setMobileMenuOpen(false);
                  }}
                >
                  {city}
                </button>
              ))}
            </div>

            {/* Mobile Sign In / Dashboard */}
            {isLanding && !user && (
              <Link
                to="/admin/login"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-foreground hover:bg-secondary"
              >
                Sign In
              </Link>
            )}
            {isLanding && user && (
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-foreground hover:bg-secondary"
              >
                Dashboard
              </Link>
            )}

            {/* Mobile Logout */}
            {user && (
              <button
                onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-red-500 hover:bg-secondary transition-colors"
              >
                <LogOut className="w-5 h-5" /> Logout
              </button>
            )}

            {/* Mobile Sell Your Event */}
            {isLanding && (
              <Link
                to={user ? "/dashboard" : "/onboarding"}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-white bg-[#F32B81] hover:bg-[#E02575]"
              >
                Sell Your Event
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
