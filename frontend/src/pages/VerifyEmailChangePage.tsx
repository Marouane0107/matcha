import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Acknowledgement } from "@matcha/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice, SuccessNotice } from "../features/auth/components/Form";
import { useProfileService } from "../features/profile/ProfileProvider";

export default function VerifyEmailChangePage({ token }: { token: string | null }) {
  const { session } = useAuth();
  const service = useProfileService();
  const request = useRef<Promise<Acknowledgement> | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    let active = true;
    request.current ??= service.verifyEmailChange({ token }).then(response => { session.clearSession(); return response; });
    request.current.then(response => { if (active) setResult(response.message); }, cause => { if (active) setError(cause); });
    return () => { active = false; };
  }, [token, service, session, attempt]);
  return <section><p className="eyebrow">Your account</p><h1 tabIndex={-1}>Verify your new email</h1>
    {!token ? <p className="notice error" role="alert">This email-change link is missing or invalid. Request a new link from account settings.</p> : result ? <SuccessNotice title="Email change verified">{result}</SuccessNotice> : error ? <><ErrorNotice error={error} /><button className="secondary" onClick={() => { request.current = null; setError(null); setAttempt(value => value + 1); }}>Try again</button></> : <p role="status">Verifying your new email...</p>}
    <p className="form-footer"><Link className={result ? "primary" : undefined} to="/login">Continue to sign in</Link></p>{!result && <Link to="/account">Request another email change</Link>}
  </section>;
}
