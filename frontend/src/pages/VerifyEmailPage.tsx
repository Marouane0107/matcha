import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Acknowledgement } from "@matcha/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice, SuccessNotice } from "../features/auth/components/Form";

export default function VerifyEmailPage({ token }: { token: string | null }) {
  const { service } = useAuth();
  const request = useRef<Promise<Acknowledgement> | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    let active = true;
    request.current ??= service.verifyEmail({ token });
    request.current.then(response => { if (active) setResult(response.message); }, cause => { if (active) setError(cause); });
    return () => { active = false; };
  }, [token, service, attempt]);
  return (
    <section aria-labelledby="verify-title">
      <p className="eyebrow">One last step</p><h1 id="verify-title" tabIndex={-1}>Verify your email.</h1>
      {!token ? <p className="notice error" role="alert">This verification link is missing or invalid. Request a new email below.</p> : result ? <SuccessNotice title="Email verified">{result}</SuccessNotice> : error ? <>
        <ErrorNotice error={error} />
        <button className="secondary" onClick={() => { request.current = null; setError(null); setAttempt(value => value + 1); }}>Try again</button>
      </> : <p role="status">Verifying your email...</p>}
      <p className="form-footer"><Link className={result ? "primary" : undefined} to="/login">Continue to sign in</Link></p>
      <Link to="/resend-verification">Resend verification email</Link>
    </section>
  );
}
