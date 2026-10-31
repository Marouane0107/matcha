import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice, Field, formValue, SuccessNotice, useTask } from "../features/auth/components/Form";
import { emailError } from "../features/auth/utils/validation";
import { LoadState, useOwnerProfile } from "../features/profile/components";
import { useProfileService } from "../features/profile/ProfileProvider";

export default function AccountPage() {
  const { accessToken } = useAuth();
  const service = useProfileService();
  const resource = useOwnerProfile();
  const task = useTask();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const newEmail = formValue(data, "newEmail").trim().toLowerCase();
    const password = formValue(data, "password");
    const invalid: Record<string, string> = {};
    const emailIssue = emailError(newEmail);
    if (emailIssue) invalid.newEmail = emailIssue;
    if (newEmail === resource.data?.email) invalid.newEmail = "Choose an email different from your current address.";
    if (!password) invalid.password = "Enter your current password.";
    setErrors(invalid); setMessage("");
    if (!accessToken || Object.keys(invalid).length) return;
    void task.run(async () => { const response = await service.changeEmail({ newEmail, password }, accessToken); form.reset(); setMessage(response.message); });
  }
  return <div className="editor-width"><p className="eyebrow">Private to you</p><h1 tabIndex={-1}>Account settings</h1><p className="intro">Keep your details up to date.</p>
    {!resource.data ? <LoadState loading={resource.loading} error={resource.error} retry={resource.reload} /> : <><dl className="profile-facts"><div><dt>Username</dt><dd>@{resource.data.username}</dd></div><div><dt>Current email</dt><dd>{resource.data.email}</dd></div></dl><section className="edit-section"><h2>Change email</h2><p className="muted">Your current address stays active until you verify the new one. Verification ends all sessions, so you will need to sign in again.</p>{message && <SuccessNotice>{message}</SuccessNotice>}<form onSubmit={submit} noValidate aria-busy={task.busy}><ErrorNotice error={task.error} /><fieldset disabled={task.busy}><Field label="New email" name="newEmail" type="email" autoComplete="email" error={errors.newEmail} required /><Field label="Current password" name="password" type="password" autoComplete="current-password" error={errors.password} required /><button className="primary" type="submit">{task.busy ? "Sending..." : "Send verification email"}</button></fieldset></form></section></>}
  </div>;
}
