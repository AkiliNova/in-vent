import {
  LayoutDashboard, CalendarDays, Users, ScanLine, QrCode, Tag, Megaphone, Wallet, Building2,
  ShieldCheck, Inbox, BookOpen, SlidersHorizontal, type LucideIcon,
} from "lucide-react";
import type { AuthUser } from "@/lib/api";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Words the command palette also matches. */
  keywords?: string;
  /** Pages that work on the event chosen in the top-bar switcher. */
  eventScoped?: boolean;
}

export interface NavGroup { label: string; items: NavItem[] }

const eventItems: NavItem[] = [
  { href: "/events", label: "Events", icon: CalendarDays, keywords: "create edit publish tickets tiers" },
  { href: "/guests", label: "Guests", icon: Users, keywords: "attendees registrations list", eventScoped: true },
  { href: "/scanner", label: "Check-in scanner", icon: ScanLine, keywords: "scan qr gate door check in", eventScoped: true },
  { href: "/register", label: "Door registration", icon: QrCode, keywords: "walk in on-site cash complimentary", eventScoped: true },
  { href: "/promo-codes", label: "Promo codes", icon: Tag, keywords: "discount coupon", eventScoped: true },
];

/** Sidebar, mobile drawer and command palette all read from here. */
export function navFor(user: AuthUser | null): NavGroup[] {
  if (user?.role === "super_admin") {
    return [
      { label: "Home", items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard, keywords: "dashboard home stats" }] },
      { label: "Events", items: eventItems },
      { label: "Engage", items: [
        { href: "/campaigns", label: "Campaigns", icon: Megaphone, keywords: "sms email bulk contacts message" },
        { href: "/admin/messages", label: "Message log", icon: Inbox, keywords: "sent emails sms delivery" },
      ] },
      { label: "Money", items: [{ href: "/admin/payouts", label: "Payouts", icon: ShieldCheck, keywords: "withdrawals mpesa b2c" }] },
      { label: "Platform", items: [
        { href: "/admin/organisers", label: "Organisers", icon: Building2, keywords: "tenants accounts merchants" },
        { href: "/admin/blog", label: "Blog", icon: BookOpen, keywords: "posts articles" },
        { href: "/admin/settings", label: "Settings", icon: SlidersHorizontal, keywords: "sms email mpesa config" },
      ] },
    ];
  }

  return [
    { label: "Home", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, keywords: "home overview" }] },
    { label: "Events", items: eventItems },
    { label: "Engage", items: [{ href: "/campaigns", label: "Campaigns", icon: Megaphone, keywords: "sms email bulk contacts message" }] },
    { label: "Money", items: [{ href: "/payouts", label: "Wallet", icon: Wallet, keywords: "balance withdraw payouts sales" }] },
    { label: "Account", items: [{ href: "/settings", label: "Business settings", icon: Building2, keywords: "profile payout number" }] },
  ];
}

export const homeFor = (user: AuthUser | null) => (user?.role === "super_admin" ? "/admin" : "/dashboard");
