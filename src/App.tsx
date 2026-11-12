import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ReactNode } from "react";

import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Scanner from "./pages/Scanner";
import Guests from "./pages/Guests";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/admin/Login";
import OrganizerOnboarding from "./pages/OrganizerOnboarding";
import EventsDashboard from "./pages/admin/EventsDashboard";
import PublicEvent from "./pages/PublicEvent";
import PaymentResponsePage from "./pages/PaymentResponsePage";
import EventsPage from "./pages/Events";
import MyTickets from "./pages/MyTickets";
import Payouts from "./pages/Payouts";
import BusinessSettings from "./pages/BusinessSettings";
import Help from "./pages/Help";
import AdminPayouts from "./pages/admin/AdminPayouts";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminMessages from "./pages/admin/AdminMessages";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import BlogManager from "./pages/admin/BlogManager";
import PromoCodes from "./pages/PromoCodes";
import Campaigns from "./pages/Campaigns";
import Registration from "./pages/Registration";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminOrganisers from "./pages/admin/AdminOrganisers";
import AdminOrganiserDetail from "./pages/admin/AdminOrganiserDetail";
import AppShell from "@/components/shell/AppShell";

// Not yet moved off Firebase, so not routed: Rooms,
// RegistrationFields, AgendaManager, SuperAdmin (replaced by /admin).
// The API already has endpoints for most of them.

const queryClient = new QueryClient();

const P = ({ children }: { children: ReactNode }) => <ProtectedRoute>{children}</ProtectedRoute>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Index />} />
          <Route path="/search-events" element={<EventsPage />} />
          <Route path="/e/:uuid" element={<PublicEvent />} />
          <Route path="/events/:tenantId/:eventId" element={<PublicEvent />} />
          <Route path="/payment-response" element={<PaymentResponsePage />} />
          <Route path="/my-tickets" element={<MyTickets />} />
          <Route path="/help" element={<Help />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:postId" element={<BlogPost />} />
          <Route path="/onboarding" element={<OrganizerOnboarding />} />
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* Signed-in app: one shell (sidebar, top bar, event switcher, Ctrl+K) */}
          <Route element={<P><AppShell /></P>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/events" element={<EventsDashboard />} />
            <Route path="/scanner" element={<Scanner />} />
            <Route path="/guests" element={<Guests />} />
            <Route path="/payouts" element={<Payouts />} />
            <Route path="/wallet" element={<Payouts />} />
            <Route path="/settings" element={<BusinessSettings />} />
            <Route path="/promo-codes" element={<PromoCodes />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/register" element={<Registration />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/organisers" element={<AdminOrganisers />} />
            <Route path="/admin/organisers/:id" element={<AdminOrganiserDetail />} />
            <Route path="/admin/payouts" element={<AdminPayouts />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/messages" element={<AdminMessages />} />
            <Route path="/admin/blog" element={<BlogManager />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
