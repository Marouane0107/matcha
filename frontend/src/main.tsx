import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./features/auth/AuthProvider";
import { createAuthSession } from "./features/auth/session";
import { selectAuthService } from "./features/auth/services/select";
import { readFragmentToken } from "./features/auth/utils/validation";
import "./styles.css";

const initialLink = readFragmentToken(window.location, window.history);
const root = createRoot(document.getElementById("root")!);
let invalidate = (_token: string) => {};
root.render(<p role="status">Loading Matcha...</p>);
void selectAuthService(token => invalidate(token)).then(service => {
  const session = createAuthSession(service);
  invalidate = session.invalidate;
  root.render(
    <StrictMode>
      <AuthProvider session={session} service={service}>
        <BrowserRouter><App initialLink={initialLink} /></BrowserRouter>
      </AuthProvider>
    </StrictMode>,
  );
}).catch(() => root.render(<p role="alert">Matcha could not start. Please reload the page.</p>));