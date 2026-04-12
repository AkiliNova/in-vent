import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Registration from "./pages/Registration";
import AdminFields from "./pages/RegistrationFields";
import Scanner from "./pages/Scanner";
import Guests from "./pages/Guests";
import Campaigns from "./pages/Campaigns";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/admin/Login";
import RoomsPage from "./pages/Rooms";
import OrganizerOnboarding from "./pages/OrganizerOnboarding";
import EventsDashboard from "./pages/admin/EventsDashboard";

// 🔹 Import ProtectedRoute
import ProtectedRoute from "@/components/ProtectedRoute";
import EventPage from "./pages/[eventId]";
import PaymentResponsePage from "./pages/PaymentResponsePage";
import EventsPage from "./pages/Events";
import MyTickets from "./pages/MyTickets";
import PromoCodes from "./pages/PromoCodes";
import Payouts from "./pages/Payouts";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Help from "./pages/Help";
import BlogManager from "./pages/admin/BlogManager";
import AgendaManager from "./pages/admin/AgendaManager";
import SuperAdmin from "./pages/admin/SuperAdmin";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          
          {/* 🔒 Protected dashboard */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          {/* Other pages that need protection can be wrapped too */}
          {/* Example: Registration page protected */}
          {/* <Route path="/register" element={<ProtectedRoute><Registration /></ProtectedRoute>} /> */}

          <Route path="/register"
           element={
            <ProtectedRoute>
           <Registration />
           </ProtectedRoute>
           } />
          <Route path="/fields" 
          element={
            <ProtectedRoute>  
          <AdminFields />
          </ProtectedRoute>
          } />
          <Route path="/scanner"
           element={
           <ProtectedRoute>
           <Scanner />
           </ProtectedRoute> 
          } />
          <Route path="/guests" 
          element={
            <ProtectedRoute>
          <Guests />
          </ProtectedRoute>
          } />
          <Route path="/campaigns" 
          element={
            <ProtectedRoute>
          <Campaigns />
          </ProtectedRoute> 
          } />
          <Route path="/settings" 
          element={
            <ProtectedRoute>
          <Settings />
          </ProtectedRoute>
          } />
          <Route path="/rooms" 
          element={
            <ProtectedRoute>
          <RoomsPage />
          </ProtectedRoute>
          } />
          <Route path="/events" 
          element={
            <ProtectedRoute>
          <EventsDashboard tenantId={localStorage.getItem('tenantId') || ''} />
          </ProtectedRoute>
          } />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/events/:tenantId/:eventId" element={<EventPage />} />
          <Route path="/payment-response" element={<PaymentResponsePage />} />
          <Route path="/onboarding" element={<OrganizerOnboarding />} />
          <Route path="/search-events" element={<EventsPage />} />
          <Route path="/my-tickets" element={<MyTickets />} />
          <Route
            path="/promo-codes"
            element={
              <ProtectedRoute>
                <PromoCodes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payouts"
            element={
              <ProtectedRoute>
                <Payouts />
              </ProtectedRoute>
            }
          />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:postId" element={<BlogPost />} />
          <Route path="/help" element={<Help />} />
          <Route
            path="/blog-manager"
            element={
              <ProtectedRoute>
                <BlogManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/agenda/:eventId"
            element={
              <ProtectedRoute>
                <AgendaManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/super-admin"
            element={
              <ProtectedRoute>
                <SuperAdmin />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
