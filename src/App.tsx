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
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import BlogManager from "./pages/admin/BlogManager";
import PromoCodes from "./pages/PromoCodes";
import Registration from "./pages/Registration";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminOrganisers from "./pages/admin/AdminOrganisers";

// Not yet moved off Firebase, so not routed: Campaigns, Rooms,
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

          {/* Organiser */}
          <Route path="/dashboard" element={<P><Dashboard /></P>} />
          <Route path="/events" element={<P><EventsDashboard /></P>} />
          <Route path="/scanner" element={<P><Scanner /></P>} />
          <Route path="/guests" element={<P><Guests /></P>} />
          <Route path="/payouts" element={<P><Payouts /></P>} />
          <Route path="/wallet" element={<P><Payouts /></P>} />
          <Route path="/settings" element={<P><BusinessSettings /></P>} />
          <Route path="/promo-codes" element={<P><PromoCodes /></P>} />
          <Route path="/register" element={<P><Registration /></P>} />
          <Route path="/admin" element={<P><AdminDashboard /></P>} />
          <Route path="/admin/organisers" element={<P><AdminOrganisers /></P>} />
          <Route path="/admin/payouts" element={<P><AdminPayouts /></P>} />
          <Route path="/admin/blog" element={<P><BlogManager /></P>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
