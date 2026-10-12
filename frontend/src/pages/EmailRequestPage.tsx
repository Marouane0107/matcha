import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice, Field, formValue, SuccessNotice, useTask } from "../features/auth/components/Form";
import { emailError } from "../features/auth/utils/validation";

export default function EmailRequestPage({ mode }: { mode: "forgot" | "resend" }) {
  const { service } = useAuth();
  const task = useTask();
  const [fieldError, setFieldError] = useState<string>();
  const [message, setMessage] = useState("");
  const forgot = mode === "forgot";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = formValue(new FormData(event.currentTarget), "email").trim().toLowerCase();
    const error = emailError(email);
    setFieldError(error);
    if (error) return;
    void task.run(async () => {
      const response = await (forgot ? service.forgotPassword({ email }) : service.resendVerification({ email }));
      setMessage(response.message);
    });
  }
  return (
    <section aria-labelledby="email-title">
      <p className="eyebrow">Let's get you back</p>
      <h1 id="email-title" tabIndex={-1}>{forgot ? "Forgot your password?" : "Check your inbox."}</h1>
      <p className="intro">{forgot ? "Request a password reset link." : "Request a new email verification link."}</p>
      {message ? <SuccessNotice>{message}</SuccessNotice> : <form onSubmit={submit} noValidate aria-busy={task.busy}>
        <ErrorNotice error={task.error} />
        <fieldset disabled={task.busy}>
          <Field label="Email" name="email" type="email" autoComplete="email" required error={fieldError} />
          <button className="primary" type="submit">{task.busy ? "Sending..." : forgot ? "Send reset link" : "Send verification link"}</button>
        </fieldset>
      </form>}
      <p className="form-footer"><Link to="/login">Back to login</Link></p>
    </section>
  );
}