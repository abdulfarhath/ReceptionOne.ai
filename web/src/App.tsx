import { Navigate, Route, Routes } from "react-router-dom";

import { RequireAdmin, RequireAuth } from "@/components/route-guards";
import { LoginPage } from "@/pages/login";
import { DayViewPage } from "@/pages/day-view";
import { NewAppointmentPage } from "@/pages/new-appointment";
import { DoctorsPage } from "@/pages/doctors";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<DayViewPage />} />
        <Route path="/appointments/new" element={<NewAppointmentPage />} />
        <Route element={<RequireAdmin />}>
          <Route path="/doctors" element={<DoctorsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
