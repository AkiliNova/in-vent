import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Registration from "./pages/Registration";
import Scanner from "./pages/Scanner";
import Guests from "./pages/Guests";
import Campaigns from "./pages/Campaigns";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/admin/Login";
import RoomsPage from "./pages/Rooms";

// 🔹 Import ProtectedRoute
import ProtectedRoute from "@/components/ProtectedRoute";

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
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
