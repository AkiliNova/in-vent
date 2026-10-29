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

// Not yet moved off Firebase, so not routed: Campaigns, PromoCodes, Rooms,
// RegistrationFields, Registration, Blog/BlogManager, AgendaManager, SuperAdmin.
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

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
