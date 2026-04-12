"use client";

import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, QrCode, ScanLine, Users, MessageSquare, Settings,
  Menu, X, House, LogOut, Tag, Wallet, Ticket, ChevronDown, BookOpen, ShieldCheck
} from 'lucide-react';
import { auth, db } from "@/firebase/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const sports  = ["Football", "Basketball", "Rugby", "Athletics", "Cricket"];
const counties = [
  "Nairobi", "Mombasa", "Kisumu", "Nakuru", "Kajiado", "Machakos",
  "Kiambu", "Bungoma", "Meru", "Eldoret"
];

const Navigation = () => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [mobileMenuOpen,    setMobileMenuOpen]    = useState(false);
  const [user,               setUser]              = useState<any>(null);
  const [isSuperAdmin,       setIsSuperAdmin]      = useState(false);
  const [openSports,         setOpenSports]        = useState(false);
  const [openCities,         setOpenCities]        = useState(false);
  const [mobileSportsOpen,   setMobileSportsOpen]  = useState(false);
  const [mobileCitiesOpen,   setMobileCitiesOpen]  = useState(false);

  const isLanding =
    ['/', '/search-events', '/blog', '/help', '/my-tickets', '/onboarding'].includes(location.pathname) ||
    location.pathname.startsWith('/events') ||
    location.pathname.startsWith('/blog/');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, "admins", firebaseUser.uid));
          setIsSuperAdmin(snap.exists() && snap.data().role === "super_admin");
        } catch (_) { setIsSuperAdmin(false); }
      } else {
        setIsSuperAdmin(false);
      }
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

  const adminLinks = [
    { href: '/dashboard',    label: 'Dashboard', icon: LayoutDashboard },
    { href: '/scanner',      label: 'Scanner',   icon: ScanLine },
    { href: '/guests',       label: 'Guests',    icon: Users },
    { href: '/events',       label: 'Events',    icon: House },
    { href: '/campaigns',    label: 'Campaigns', icon: MessageSquare },
    { href: '/promo-codes',  label: 'Promos',    icon: Tag },
    { href: '/payouts',      label: 'Payouts',   icon: Wallet },
    { href: '/blog-manager', label: 'Blog',      icon: BookOpen },
    { href: '/register',     label: 'Register',  icon: QrCode },
    { href: '/settings',     label: 'Settings',  icon: Settings },
    ...(isSuperAdmin ? [{ href: '/super-admin', label: 'Admin', icon: ShieldCheck }] : []),
  ];

  const publicExtraLinks = [{ href: '/my-tickets', label: 'My Tickets', icon: Ticket }];

  // Landing uses md breakpoint (few links); dashboard uses lg (many links)
  const desktopShow  = isLanding ? 'hidden md:flex'    : 'hidden lg:flex';
  const hamburgerShow = isLanding ? 'md:hidden'         : 'lg:hidden';
  const mobilePanel  = isLanding ? 'md:hidden'         : 'lg:hidden';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <img src="/assets/logo.png" alt="Tikooh" className="w-[160px] h-[50px] object-contain" />
          </Link>

          {/* ── Desktop Navigation ────────────────────────────────────────── */}
          <div className={`${desktopShow} items-center gap-0.5`}>

            {isLanding ? (
              /* Landing links */
              <>
                {[{ href: '/search-events', label: 'Events' }, { href: '/help', label: 'Help' }, { href: '/blog', label: 'Blog' }].map(link => (
                  <Link
                    key={link.href}
                    to={link.href}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                      location.pathname === link.href ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}

                {/* Sports dropdown */}
                <div className="relative" onMouseEnter={() => setOpenSports(true)} onMouseLeave={() => setOpenSports(false)}>
                  <button className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    Sports <ChevronDown className="w-3 h-3" />
                  </button>
                  {openSports && (
                    <div className="absolute top-full left-0 mt-1 w-40 bg-background border border-border rounded-lg shadow-lg z-50">
                      {sports.map(sport => (
                        <button key={sport} className="block w-full text-left px-4 py-2 text-sm hover:bg-primary/20"
                          onClick={() => navigate(`/search-events?type=${encodeURIComponent(sport)}`)}>
                          {sport}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cities dropdown */}
                <div className="relative" onMouseEnter={() => setOpenCities(true)} onMouseLeave={() => setOpenCities(false)}>
                  <button className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    Cities <ChevronDown className="w-3 h-3" />
                  </button>
                  {openCities && (
                    <div className="absolute top-full left-0 mt-1 w-40 bg-background border border-border rounded-lg shadow-lg z-50">
                      {counties.map(city => (
                        <button key={city} className="block w-full text-left px-4 py-2 text-sm hover:bg-primary/20"
                          onClick={() => navigate(`/search-events?city=${encodeURIComponent(city)}`)}>
                          {city}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* My Tickets */}
                {publicExtraLinks.map(link => (
                  <Link key={link.href} to={link.href}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    <link.icon className="w-4 h-4" /> {link.label}
                  </Link>
                ))}

                {/* Sign In / Dashboard */}
                {!user
                  ? <Button variant="ghost" size="sm" className="ml-1" asChild><Link to="/admin/login">Sign In</Link></Button>
                  : <Button variant="ghost" size="sm" className="ml-1" asChild><Link to="/dashboard">Dashboard</Link></Button>
                }
              </>
            ) : (
              /* Admin / Dashboard links — icon + label, compact */
              <>
                {adminLinks.map(link => {
                  const isActive = location.pathname === link.href || location.pathname.startsWith(link.href + '/');
                  return (
                    <Link
                      key={link.href}
                      to={link.href}
                      title={link.label}
                      className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${
                        isActive ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                      }`}
                    >
                      <link.icon className="w-4 h-4 flex-shrink-0" />
                      <span className="hidden xl:inline">{link.label}</span>
                    </Link>
                  );
                })}

                {/* Logout */}
                {user && (
                  <Button variant="ghost" size="sm" className="flex items-center gap-1.5 ml-1 text-sm" onClick={handleLogout}>
                    <LogOut className="w-4 h-4" />
                    <span className="hidden xl:inline">Logout</span>
                  </Button>
                )}
              </>
            )}
          </div>

          {/* ── Right side: Sell Your Event + hamburger ───────────────────── */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isLanding && (
              <Button variant="hero" size="sm" asChild
                className="bg-[#F32B81] hover:bg-[#E02575] text-white hidden md:inline-flex">
                <Link to={user ? "/dashboard" : "/onboarding"}>Sell Your Event</Link>
              </Button>
            )}

            <Button variant="ghost" size="icon" className={hamburgerShow}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* ── Mobile Menu ───────────────────────────────────────────────────── */}
        {mobileMenuOpen && (
          <div className={`${mobilePanel} pt-4 pb-2 border-t border-border mt-4 space-y-1`}>

            {isLanding ? (
              <>
                {[{ href: '/search-events', label: 'Events' }, { href: '/help', label: 'Help' }, { href: '/blog', label: 'Blog' }].map(link => (
                  <Link key={link.href} to={link.href} onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      location.pathname === link.href ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}>
                    {link.label}
                  </Link>
                ))}

                {/* Mobile Sports */}
                <div className="flex flex-col">
                  <button onClick={() => setMobileSportsOpen(!mobileSportsOpen)}
                    className="flex items-center justify-between px-4 py-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    <span className="font-medium">Sports</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${mobileSportsOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {mobileSportsOpen && (
                    <div className="ml-4 mt-1 flex flex-col gap-0.5">
                      {sports.map(sport => (
                        <button key={sport} className="text-left px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-colors"
                          onClick={() => { navigate(`/search-events?type=${encodeURIComponent(sport)}`); setMobileMenuOpen(false); }}>
                          {sport}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Mobile Cities */}
                <div className="flex flex-col">
                  <button onClick={() => setMobileCitiesOpen(!mobileCitiesOpen)}
                    className="flex items-center justify-between px-4 py-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    <span className="font-medium">Cities</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${mobileCitiesOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {mobileCitiesOpen && (
                    <div className="ml-4 mt-1 flex flex-col gap-0.5">
                      {counties.map(city => (
                        <button key={city} className="text-left px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-colors"
                          onClick={() => { navigate(`/search-events?city=${encodeURIComponent(city)}`); setMobileMenuOpen(false); }}>
                          {city}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {publicExtraLinks.map(link => (
                  <Link key={link.href} to={link.href} onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary">
                    <link.icon className="w-5 h-5" /> {link.label}
                  </Link>
                ))}

                {!user
                  ? <Link to="/admin/login" onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-foreground hover:bg-secondary">
                      Sign In
                    </Link>
                  : <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-foreground hover:bg-secondary">
                      Dashboard
                    </Link>
                }

                <Link to={user ? "/dashboard" : "/onboarding"} onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-white bg-[#F32B81] hover:bg-[#E02575]">
                  Sell Your Event
                </Link>
              </>
            ) : (
              /* Admin mobile menu */
              <>
                {adminLinks.map(link => {
                  const isActive = location.pathname === link.href || location.pathname.startsWith(link.href + '/');
                  return (
                    <Link key={link.href} to={link.href} onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        isActive ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                      }`}>
                      <link.icon className="w-5 h-5" /> {link.label}
                    </Link>
                  );
                })}

                {user && (
                  <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-500 hover:bg-secondary transition-colors">
                    <LogOut className="w-5 h-5" /> Logout
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
