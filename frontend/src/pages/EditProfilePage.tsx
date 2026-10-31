import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useBlocker } from "react-router-dom";
import { DEFAULT_SEXUAL_PREFERENCE } from "@matcha/shared";
import type { Gender, ProfileUpdateRequest, Tag, UserProfile } from "@matcha/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice, Field, useTask } from "../features/auth/components/Form";
import { useProfileService } from "../features/profile/ProfileProvider";
import { LoadState, useOwnerProfile } from "../features/profile/components";
import { genders, preferences, toggleTag, validateProfile } from "../features/profile/validation";

type Draft = Omit<Required<ProfileUpdateRequest>, "gender"> & { gender: Gender | "" };
const draftFrom = (profile: UserProfile): Draft => ({ firstName: profile.firstName, lastName: profile.lastName, dateOfBirth: profile.dateOfBirth ?? "", gender: profile.gender ?? "", sexualPreference: profile.sexualPreference ?? DEFAULT_SEXUAL_PREFERENCE, bio: profile.bio, tagIds: profile.tags.map(tag => tag.id) });

function ProfileEditor({ profile }: { profile: UserProfile }) {
  const service = useProfileService();
  const { accessToken } = useAuth();
  const task = useTask();
  const [draft, setDraft] = useState(() => draftFrom(profile));
  const [baseline, setBaseline] = useState(() => JSON.stringify(draftFrom(profile)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [tagError, setTagError] = useState<unknown>(null);
  const [tagAttempt, setTagAttempt] = useState(0);
  const dirty = JSON.stringify(draft) !== baseline;
  const blocker = useBlocker(dirty && Boolean(accessToken));
  const confirmation = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (blocker.state === "blocked") confirmation.current?.showModal();
    else confirmation.current?.close();
  }, [blocker.state]);
  useEffect(() => {
    let active = true;
    setTagError(null);
    if (accessToken) void service.tags(accessToken).then(value => { if (active) setTags(value); }, error => { if (active) setTagError(error); });
    return () => { active = false; };
  }, [service, accessToken, tagAttempt]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", unload);
    return () => { window.removeEventListener("beforeunload", unload); };
  }, [dirty]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request: ProfileUpdateRequest = { firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), sexualPreference: draft.sexualPreference, bio: draft.bio.trim(), tagIds: draft.tagIds, ...(draft.dateOfBirth || profile.dateOfBirth ? { dateOfBirth: draft.dateOfBirth } : {}), ...(draft.gender ? { gender: draft.gender } : {}) };
    const invalid = validateProfile(request);
    if (profile.gender && !draft.gender) invalid.gender = "Choose a gender; a saved gender cannot be cleared.";
    setErrors(invalid);
    setMessage("");
    if (!accessToken || !tags || Object.keys(invalid).length) return;
    void task.run(async () => {
      const updated = await service.update(request, accessToken);
      const next = draftFrom(updated);
      setDraft(next); setBaseline(JSON.stringify(next)); setMessage("Your profile has been saved.");
    });
  }
  const change = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => { setDraft(current => ({ ...current, [key]: value })); setMessage(""); };
  return <form onSubmit={submit} noValidate aria-busy={task.busy} className="profile-form">
    <dialog ref={confirmation} aria-labelledby="discard-title" onCancel={event => { event.preventDefault(); if (blocker.state === "blocked") blocker.reset(); }} onKeyDown={event => { if (event.key === "Escape" && blocker.state === "blocked") { event.preventDefault(); blocker.reset(); } }}>
      <h2 id="discard-title">Discard your unsaved profile changes?</h2>
      <p>Your changes have not been saved.</p>
      <button type="button" autoFocus className="secondary" onClick={() => { if (blocker.state === "blocked") blocker.reset(); }}>Stay on this page</button>{" "}
      <button type="button" className="primary compact" onClick={() => { if (blocker.state === "blocked") blocker.proceed(); }}>Discard changes</button>
    </dialog>
    {message && <p className="notice success" role="status">{message}</p>}
    <ErrorNotice error={task.error} />
    <fieldset disabled={task.busy}>
      <section className="edit-section"><h2>The essentials</h2><p className="muted">Your username stays @{profile.username}. Your birth date is private; only your age appears publicly.</p>
        <div className="name-row"><Field label="First name" name="firstName" autoComplete="given-name" value={draft.firstName} onChange={event => change("firstName", event.target.value)} error={errors.firstName} /><Field label="Last name" name="lastName" autoComplete="family-name" value={draft.lastName} onChange={event => change("lastName", event.target.value)} error={errors.lastName} /></div>
        <Field label="Date of birth" name="dateOfBirth" type="date" autoComplete="bday" value={draft.dateOfBirth} onChange={event => change("dateOfBirth", event.target.value)} error={errors.dateOfBirth} hint="Ages 18 to 120. Required before discovery." />
        <div className="name-row"><div className="field"><label htmlFor="gender">Gender</label><select id="gender" value={draft.gender} onChange={event => change("gender", event.target.value as Draft["gender"])} aria-invalid={Boolean(errors.gender)} aria-describedby={errors.gender ? "gender-error" : undefined}><option value="">Not provided</option>{Object.entries(genders).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{errors.gender && <p id="gender-error" className="field-error">{errors.gender}</p>}</div>
        <div className="field"><label htmlFor="preference">Interested in</label><select id="preference" value={draft.sexualPreference} onChange={event => change("sexualPreference", event.target.value as Draft["sexualPreference"])}>{Object.entries(preferences).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
      </section>
      <section className="edit-section"><h2>Your story</h2><div className="field"><label htmlFor="bio">Biography</label><textarea id="bio" rows={5} value={draft.bio} onChange={event => change("bio", event.target.value)} aria-invalid={Boolean(errors.bio)} aria-describedby="bio-count bio-error" placeholder="A favorite place, a small obsession, a perfect Sunday..." /><p id="bio-count" className="hint">{[...draft.bio].length} / 1,000 characters</p><p id="bio-error" className="field-error">{errors.bio}</p></div></section>
      <section id="interests" className="edit-section"><h2>What are you into?</h2><p id="tags-help" className="muted">Choose up to 10 interests. {draft.tagIds.length} selected.</p>
        {tagError ? <><ErrorNotice error={tagError} /><button className="secondary" type="button" onClick={() => setTagAttempt(value => value + 1)}>Retry interests</button></> : !tags ? <p role="status">Loading interests...</p> : <div className="tag-options" role="group" aria-label="Interests" aria-describedby="tags-help">{tags.map(tag => <label key={tag.id} className={draft.tagIds.includes(tag.id) ? "selected" : ""}><input type="checkbox" checked={draft.tagIds.includes(tag.id)} disabled={!draft.tagIds.includes(tag.id) && draft.tagIds.length >= 10} onChange={() => change("tagIds", toggleTag(draft.tagIds, tag.id))} />{tag.name}</label>)}</div>}
        {errors.tagIds && <p className="field-error" role="alert">{errors.tagIds}</p>}
      </section>
      <div className="save-bar"><p className="muted">{dirty ? "Unsaved changes" : "Up to date"}</p><Link className="secondary" to="/profile">Back to profile</Link><button className="primary compact" disabled={!tags || !dirty} type="submit">{task.busy ? "Saving..." : "Save changes"}</button></div>
    </fieldset>
  </form>;
}

export default function EditProfilePage() {
  const resource = useOwnerProfile();
  return <div className="editor-width"><p className="eyebrow">Make it yours</p><h1 tabIndex={-1}>Edit your profile</h1><p className="intro">The details that make you, you.</p>{resource.data ? <ProfileEditor profile={resource.data} /> : <LoadState loading={resource.loading} error={resource.error} retry={resource.reload} />}</div>;
}
