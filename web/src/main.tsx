import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { EmptyState, Layout } from "./components/ui";
import { Admin } from "./pages/Admin";
import { Bookings, Confirmation } from "./pages/Bookings";
import { Checkout } from "./pages/Checkout";
import { HotelPage } from "./pages/Hotel";
import { HowItWorks } from "./pages/HowItWorks";
import { Landing } from "./pages/Landing";
import { Results } from "./pages/Results";
import "./index.css";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <div className="container-x py-16">
      <EmptyState title="Page not found" body="That address doesn't exist. The search is one click away." action={<Link to="/" className="btn btn-primary btn-sm">Go home</Link>} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="search" element={<Results />} />
          <Route path="hotel/:id" element={<HotelPage />} />
          <Route path="checkout/:hotelId/:roomId" element={<Checkout />} />
          <Route path="confirmation/:id" element={<Confirmation />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="admin" element={<Admin />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
