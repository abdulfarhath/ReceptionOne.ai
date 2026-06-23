import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { RequireAdmin, RequireAuth } from "@/components/route-guards";
import { Spinner } from "@/components/states";
import { LoginPage } from "@/pages/login";
import { DayViewPage } from "@/pages/day-view";
import { NewAppointmentPage } from "@/pages/new-appointment";
import { DoctorsPage } from "@/pages/doctors";
import { PatientsPage } from "@/pages/patients";
import { PatientDetailPage } from "@/pages/patient-detail";
import { DoctorInsightsPage } from "@/pages/doctor-insights";
import { BroadcastsPage } from "@/pages/broadcasts";

// Code-split the analytics page so its charting library (Recharts) only loads
// when the route is visited, keeping the main bundle lean.
const AnalyticsPage = lazy(() =>
  import("@/pages/analytics").then((m) => ({ default: m.AnalyticsPage })),
);

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<DayViewPage />} />
        <Route path="/appointments/new" element={<NewAppointmentPage />} />
        <Route path="/patients" element={<PatientsPage />} />
        <Route path="/patients/:id" element={<PatientDetailPage />} />
        <Route path="/broadcasts" element={<BroadcastsPage />} />
        <Route
          path="/analytics"
          element={
            <Suspense fallback={<Spinner label="Loading analytics…" />}>
              <AnalyticsPage />
            </Suspense>
          }
        />
        <Route path="/doctors/:id/insights" element={<DoctorInsightsPage />} />
        <Route element={<RequireAdmin />}>
          <Route path="/doctors" element={<DoctorsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
