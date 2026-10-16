import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice, Field, formValue, SuccessNotice, useTask } from "../features/auth/components/Form";
import { cleanErrors, passwordError, passwordHint } from "../features/auth/utils/validation";
import type { FieldErrors } from "../features/auth/utils/validation";

export default function ResetPasswordPage({ token }: { token: string | null }) {
  const { service, session } = useAuth();
  const task = useTask();
  const [fields, setFields] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = formValue(data, "password");
    const errors = cleanErrors({ password: passwordError(password), confirmPassword: password === formValue(data, "confirmPassword") ? undefined : "Passwords must match." });
    setFields(errors);
    if (Object.keys(errors).length) return;
    void task.run(async () => { const result = await service.resetPassword({ token, password }); session.clearSession(); form.reset(); setMessage(result.message); });
  }
  return (
    <section aria-labelledby="reset-title">
      <p className="eyebrow">A fresh start</p><h1 id="reset-title" tabIndex={-1}>Create a new password</h1>
      <p className="intro">Make it unique. Keep it yours.</p>
      {!token ? <p className="notice error" role="alert">This reset link is missing or invalid. Request a new link.</p> : message ? <SuccessNotice title="Password updated">{message}</SuccessNotice> :
        <form onSubmit={submit} noValidate aria-busy={task.busy}>
          <ErrorNotice error={task.error} />
          <fieldset disabled={task.busy}>
            <Field label="New password" name="password" type="password" autoComplete="new-password" required hint={passwordHint} error={fields.password} />
            <Field label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" required error={fields.confirmPassword} />
            <button className="primary" type="submit">{task.busy ? "Resetting..." : "Reset password"}</button>
          </fieldset>
        </form>}
      <p className="form-footer"><Link className={message ? "primary" : undefined} to="/login">Back to sign in</Link></p>
      {!message && <Link to="/forgot-password">Request a new reset link</Link>}
    </section>
  );
}
