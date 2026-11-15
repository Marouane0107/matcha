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
import { InteractionProvider, selectInteractions } from "./features/interactions/InteractionProvider";
import { RealtimeProvider, selectRealtime } from "./features/realtime/RealtimeProvider";
import "./styles/realtime.css";

const initialLink = readFragmentToken(window.location, window.history);
const root = createRoot(document.getElementById("root")!);
let invalidate = (_token: string) => {};
root.render(<p role="status">Loading Matcha...</p>);
void Promise.all([selectAuthService(token => invalidate(token)), selectProfileService(token => invalidate(token))]).then(async ([service, profileService]) => {
  const interactions = await selectInteractions(profileService, token => invalidate(token));
  const discoveryService = await selectDiscoveryService(interactions.profiles, token => invalidate(token));
  const realtime = await selectRealtime(interactions.profiles, interactions.service, token => invalidate(token));
  const session = createAuthSession(service);
  invalidate = session.invalidate;
  const router = createBrowserRouter([{ path: "*", element: <App initialLink={initialLink} /> }]);
  root.render(
    <StrictMode>
      <AuthProvider session={session} service={service}>
      <ProfileProvider service={interactions.profiles}><InteractionProvider service={interactions.service}><RealtimeProvider bundle={realtime}><DiscoveryProvider service={discoveryService}><RouterProvider router={router} /></DiscoveryProvider></RealtimeProvider></InteractionProvider></ProfileProvider>
      </AuthProvider>
    </StrictMode>,
  );
}).catch(() => root.render(<p role="alert">Matcha could not start. Please reload the page.</p>));
