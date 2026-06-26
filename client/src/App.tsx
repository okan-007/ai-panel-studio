import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import HomePage from "./pages/HomePage";
import ConfirmLineupPage from "./pages/ConfirmLineupPage";
import StudioPage from "./pages/StudioPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Pages with standard header */}
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/lineup" element={<ConfirmLineupPage />} />
        </Route>

        {/* Studio page — full-screen, no standard header */}
        <Route path="/studio/:discussionId" element={<StudioPage />} />
      </Routes>
    </BrowserRouter>
  );
}
