import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./features/auth/AuthProvider";
import { createAuthSession } from "./features/auth/session";
import { selectAuthService } from "./features/auth/services/select";
import { readFragmentToken } from "./features/auth/utils/validation";
import "./styles.css";
import "./styles/profile.css";
import { ProfileProvider, selectProfileService } from "./features/profile/ProfileProvider";
import { DiscoveryProvider, selectDiscoveryService } from "./features/discovery/DiscoveryProvider";

const initialLink = readFragmentToken(window.location, window.history);
const root = createRoot(document.getElementById("root")!);
let invalidate = (_token: string) => {};
root.render(<p role="status">Loading Matcha...</p>);
void Promise.all([selectAuthService(token => invalidate(token)), selectProfileService(token => invalidate(token))]).then(async ([service, profileService]) => {
  const discoveryService = await selectDiscoveryService(profileService, token => invalidate(token));
  const session = createAuthSession(service);
  invalidate = session.invalidate;
  const router = createBrowserRouter([{ path: "*", element: <App initialLink={initialLink} /> }]);
  root.render(
    <StrictMode>
      <AuthProvider session={session} service={service}>
        <ProfileProvider service={profileService}><DiscoveryProvider service={discoveryService}><RouterProvider router={router} /></DiscoveryProvider></ProfileProvider>
      </AuthProvider>
    </StrictMode>,
  );
}).catch(() => root.render(<p role="alert">Matcha could not start. Please reload the page.</p>));
