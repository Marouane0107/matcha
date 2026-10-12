import { Navigate, Route, Routes } from "react-router-dom";
import { GuestRoute, ProtectedRoute } from "./features/auth/components/RouteGuards";
import AuthLayout from "./layouts/AuthLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import EmailRequestPage from "./pages/EmailRequestPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ProfilePlaceholderPage from "./pages/ProfilePlaceholderPage";

export default function App({ initialLink }: { initialLink: { path: string; token: string | null } }) {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route path="/forgot-password" element={<EmailRequestPage key="forgot" mode="forgot" />} />
        <Route path="/resend-verification" element={<EmailRequestPage key="resend" mode="resend" />} />
        <Route path="/verify-email" element={<VerifyEmailPage token={initialLink.path === "/verify-email" ? initialLink.token : null} />} />
        <Route path="/reset-password" element={<ResetPasswordPage token={initialLink.path === "/reset-password" ? initialLink.token : null} />} />
        <Route element={<ProtectedRoute />}><Route path="/profile" element={<ProfilePlaceholderPage />} /></Route>
        <Route path="*" element={<Navigate to="/profile" replace />} />
      </Route>
    </Routes>
  );
}
