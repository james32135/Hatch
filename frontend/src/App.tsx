import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { useEffect } from "react";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Judges from "@/pages/Judges";
import Diag from "@/pages/Diag";
import NotFound from "@/pages/NotFound";

import ParentGuard from "@/components/guards/ParentGuard";
import ChildGuard from "@/components/guards/ChildGuard";
import AppShell from "@/components/layout/AppShell";
import ChildShell from "@/components/layout/ChildShell";

import Onboarding from "@/pages/app/Onboarding";
import Dashboard from "@/pages/app/Dashboard";
import ChildrenList from "@/pages/app/ChildrenList";
import ChildDetail from "@/pages/app/ChildDetail";
import ChildPortfolio from "@/pages/app/ChildPortfolio";
import ChildAllowance from "@/pages/app/ChildAllowance";
import ChildLessons from "@/pages/app/ChildLessons";
import ChildProjections from "@/pages/app/ChildProjections";
import ChildSSI from "@/pages/app/ChildSSI";
import Sodex from "@/pages/app/Sodex";
import ValueChain from "@/pages/app/ValueChain";
import Activity from "@/pages/app/Activity";
import Notifications from "@/pages/app/Notifications";
import Settings from "@/pages/app/Settings";

import ChildHome from "@/pages/child/ChildHome";
import ChildWhy from "@/pages/child/ChildWhy";
import ChildLearn from "@/pages/child/ChildLearn";
import ChildKidPortfolio from "@/pages/child/ChildKidPortfolio";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
});

function ForceDark() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }, []);
  return null;
}

const App = () => (
  <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner theme="dark" position="top-right" />
        <ForceDark />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/judges" element={<Judges />} />
            <Route path="/diag" element={<Diag />} />

            <Route path="/app" element={<ParentGuard><AppShell /></ParentGuard>}>
              <Route index element={<Dashboard />} />
              <Route path="onboarding" element={<Onboarding />} />
              <Route path="children" element={<ChildrenList />} />
              <Route path="children/:childId" element={<ChildDetail />} />
              <Route path="children/:childId/portfolio" element={<ChildPortfolio />} />
              <Route path="children/:childId/allowance" element={<ChildAllowance />} />
              <Route path="children/:childId/lessons" element={<ChildLessons />} />
              <Route path="children/:childId/projections" element={<ChildProjections />} />
              <Route path="children/:childId/ssi" element={<ChildSSI />} />
              <Route path="sodex" element={<Sodex />} />
              <Route path="valuechain" element={<ValueChain />} />
              <Route path="activity" element={<Activity />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="/child" element={<ChildGuard><ChildShell /></ChildGuard>}>
              <Route index element={<ChildHome />} />
              <Route path="why" element={<ChildWhy />} />
              <Route path="learn" element={<ChildLearn />} />
              <Route path="portfolio" element={<ChildKidPortfolio />} />
            </Route>

            <Route path="/dashboard" element={<Navigate to="/app" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </WagmiProvider>
);

export default App;
