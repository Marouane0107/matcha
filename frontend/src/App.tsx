import { Navigate, Route, Routes } from "react-router-dom";
import { GuestRoute, ProtectedRoute } from "./features/auth/components/RouteGuards";
import AuthLayout from "./layouts/AuthLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import EmailRequestPage from "./pages/EmailRequestPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AppLayout from "./layouts/AppLayout";
import ProfilePage from "./pages/ProfilePage";
import EditProfilePage from "./pages/EditProfilePage";
import PicturesPage from "./pages/PicturesPage";
import PublicProfilePage from "./pages/PublicProfilePage";
import AccountPage from "./pages/AccountPage";
import VerifyEmailChangePage from "./pages/VerifyEmailChangePage";

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
        <Route path="/verify-email-change" element={<VerifyEmailChangePage token={initialLink.path === "/verify-email-change" ? initialLink.token : null} />} />
        <Route path="*" element={<Navigate to="/profile" replace />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/edit" element={<EditProfilePage />} />
          <Route path="/profile/pictures" element={<PicturesPage />} />
          <Route path="/profiles/:username" element={<PublicProfilePage />} />
          <Route path="/account" element={<AccountPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
