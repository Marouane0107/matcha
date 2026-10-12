import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import { canAccessProfile } from "../session";

export function ProtectedRoute() {
  const auth = useAuth();
  if (auth.status === "loading") return <p role="status">Checking your session...</p>;
  return canAccessProfile(auth) ? <Outlet /> : <Navigate to="/login" replace />;
}

export function GuestRoute() {
  const auth = useAuth();
  return canAccessProfile(auth) ? <Navigate to="/profile" replace /> : <Outlet />;
}