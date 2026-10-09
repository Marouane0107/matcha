import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import type { RegisterRequest } from "@matcha/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice, Field, formValue, SuccessNotice, useTask } from "../features/auth/components/Form";
import { cleanErrors, emailError, nameError, passwordError, passwordHint, usernameError } from "../features/auth/utils/validation";
import type { FieldErrors } from "../features/auth/utils/validation";

export default function RegisterPage() {
  const { service } = useAuth();
  const task = useTask();
  const [fields, setFields] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const request: RegisterRequest = {
      email: formValue(data, "email").trim().toLowerCase(),
      username: formValue(data, "username").trim().toLowerCase(),
      firstName: formValue(data, "firstName").trim(),
      lastName: formValue(data, "lastName").trim(),
      password: formValue(data, "password"),
    };
    const errors = cleanErrors({ email: emailError(request.email), username: usernameError(request.username), firstName: nameError(request.firstName), lastName: nameError(request.lastName), password: passwordError(request.password), confirmPassword: request.password === formValue(data, "confirmPassword") ? undefined : "Passwords must match." });
    setFields(errors);
    if (Object.keys(errors).length) return;
    void task.run(async () => { const response = await service.register(request); form.reset(); setMessage(response.message); });
  }
  return (
    <section aria-labelledby="register-title">
      <p className="eyebrow">Start with a hello</p><h1 id="register-title" tabIndex={-1}>Meet your people.</h1>
      <p className="intro">Create your Matcha account.</p>
      {message ? <><SuccessNotice>{message}</SuccessNotice><p>Check your inbox before logging in.</p><Link to="/resend-verification">Resend verification email</Link></> :
        <form onSubmit={submit} noValidate aria-busy={task.busy}>
          <ErrorNotice error={task.error} />
          <fieldset disabled={task.busy}>
            <div className="name-row"><Field label="First name" name="firstName" autoComplete="given-name" required error={fields.firstName} /><Field label="Last name" name="lastName" autoComplete="family-name" required error={fields.lastName} /></div>
            <Field label="Email" name="email" type="email" autoComplete="email" required error={fields.email} />
            <Field label="Username" name="username" autoComplete="username" autoCapitalize="none" required hint="3 to 30 letters, numbers or underscores. Start with a letter." error={fields.username} />
            <Field label="Password" name="password" type="password" autoComplete="new-password" required hint={passwordHint} error={fields.password} />
            <Field label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" required error={fields.confirmPassword} />
            <button className="primary" type="submit">{task.busy ? "Creating account..." : "Create account"}</button>
          </fieldset>
        </form>}
      <p className="form-footer">Already registered? <Link to="/login">Log in</Link></p>
    </section>
  );
}