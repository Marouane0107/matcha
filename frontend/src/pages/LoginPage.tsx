import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ERROR_CODES } from "@matcha/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice, Field, formValue, useTask } from "../features/auth/components/Form";
import { ApiRequestError } from "../services/api/client";
import type { FieldErrors } from "../features/auth/utils/validation";

export default function LoginPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const task = useTask();
  const [fields, setFields] = useState<FieldErrors>({});
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const username = formValue(data, "username").trim().toLowerCase();
    const password = formValue(data, "password");
    const errors: FieldErrors = {};
    if (!username) errors.username = "Enter your username.";
    if (!password) errors.password = "Enter your password.";
    setFields(errors);
    if (Object.keys(errors).length) return;
    void task.run(async () => { if (await session.login({ username, password })) navigate("/profile", { replace: true }); });
  }
  const unverified = task.error instanceof ApiRequestError && task.error.error.code === ERROR_CODES.EMAIL_NOT_VERIFIED;
  return (
    <section aria-labelledby="login-title">
      <p className="eyebrow">Your next chapter</p>
      <h1 id="login-title" tabIndex={-1}>Welcome back.</h1>
      <p className="intro">Sign in to continue to Matcha.</p>
      {location.state?.logout === "revoked" && <p className="notice success" role="status">You have been logged out of all sessions.</p>}
      {location.state?.logout === "local" && <p className="notice warning" role="status">You are logged out on this device. We couldn't confirm logout on the server; other sessions may remain active until they expire.</p>}
      <form onSubmit={submit} noValidate aria-busy={task.busy}>
        {unverified ? <div className="notice warning" role="alert"><strong className="success-heading">Verify your email first</strong><p>Check your inbox to finish setting up your account.</p><Link to="/resend-verification">Send a new verification email</Link></div> : <ErrorNotice error={task.error} />}
        <fieldset disabled={task.busy}>
          <Field label="Username" name="username" autoComplete="username" autoCapitalize="none" required error={fields.username} />
          <Field label="Password" name="password" type="password" autoComplete="current-password" required error={fields.password} />
          <Link className="quiet-link" to="/forgot-password">Forgot password?</Link>
          <button className="primary" type="submit">{task.busy ? "Signing in..." : "Sign in"}</button>
        </fieldset>
      </form>
      <p className="form-footer">New here? <Link to="/register">Create an account</Link></p>
    </section>
  );
}
