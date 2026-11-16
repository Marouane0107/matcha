import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useBlocker } from "react-router-dom";
import type { LocationMode, LocationUpdateRequest, UserProfile } from "@matcha/shared";
import { ERROR_CODES } from "@matcha/shared";
import { useAuth } from "../auth/AuthProvider";
import { Field, ErrorNotice } from "../auth/components/Form";
import { ApiRequestError } from "../../services/api/client";
import { useProfileService } from "../profile/ProfileProvider";
import { useGeolocation } from "./useGeolocation";
import { locationErrors } from "./validation";

export default function LocationSelector({ profile, onSaved }: { profile: UserProfile; onSaved: () => void }) {
  const service = useProfileService();
  const { accessToken } = useAuth();
  const gps = useGeolocation();
  const [mode, setMode] = useState<LocationMode>(profile.location?.mode ?? "manual");
  const [city, setCity] = useState(profile.location?.city ?? "");
  const [neighborhood, setNeighborhood] = useState(profile.location?.neighborhood ?? "");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const active = useRef(true);
  const saving = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const dirty = !saved && (city !== (profile.location?.city ?? "") || neighborhood !== (profile.location?.neighborhood ?? "") || Boolean(profile.location && mode !== profile.location.mode) || gps.position !== null);
  const blocker = useBlocker(Boolean(accessToken) && (dirty || busy));
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (blocker.state === "blocked") dialog.current?.showModal(); else dialog.current?.close(); }, [blocker.state]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty, busy]);
  function switchMode(next: LocationMode) { gps.clear(); setConsent(false); setMode(next); setErrors({}); setError(null); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || saving.current || mode === "gps" && !gps.position) return;
    const place = { city: city.trim(), neighborhood: neighborhood.trim() || null };
    const request: LocationUpdateRequest = mode === "gps" && gps.position
      ? { ...place, mode: "gps", latitude: gps.position.latitude, longitude: gps.position.longitude }
      : { ...place, mode: "manual" };
    const invalid = locationErrors(request);
    setErrors(invalid); setError(null);
    if (Object.keys(invalid).length) return;
    saving.current = true; setBusy(true);
    try {
      await service.updateLocation(request, accessToken);
      if (active.current) { setSaved(true); gps.clear(); onSaved(); }
    } catch (cause) { if (active.current) setError(cause); }
    finally { saving.current = false; if (active.current) setBusy(false); }
  }
  return <>
    <dialog ref={dialog} aria-labelledby="location-discard-title" onCancel={event => { event.preventDefault(); if (blocker.state === "blocked") blocker.reset(); }} onKeyDown={event => { if (event.key === "Escape" && blocker.state === "blocked") { event.preventDefault(); blocker.reset(); } }}>
      <h2 id="location-discard-title">Leave without saving?</h2><p>{busy ? "A save is in progress. Leaving cannot cancel a request already sent." : "Your location changes have not been saved."}</p>
      <button type="button" autoFocus className="secondary" onClick={() => { if (blocker.state === "blocked") blocker.reset(); }}>Stay on this page</button>{" "}<button type="button" className="primary compact" onClick={() => { if (blocker.state === "blocked") blocker.proceed(); }}>Discard changes</button>
    </dialog>
    <p className="notice">Your city and neighborhood can appear on your profile. Exact coordinates stay private and help find people nearby.</p>
    <form className="profile-form" onSubmit={event => void submit(event)} noValidate aria-busy={busy}>
      <fieldset disabled={busy}>
        <legend>Choose your location method</legend>
        <div className="action-row location-methods"><label><input type="radio" name="location-method" checked={mode === "gps"} onChange={() => switchMode("gps")} /> Current location</label><label><input type="radio" name="location-method" checked={mode === "manual"} onChange={() => switchMode("manual")} /> Enter manually</label></div>
        <section className="edit-section">
          <h2>{mode === "gps" ? "Use your current location" : "Choose your area"}</h2>
          {mode === "gps" && <>
            <button type="button" className="secondary" disabled={gps.loading} onClick={() => setConsent(true)}>Use my current location</button>
            {consent && !gps.position && <div className="notice"><p>With your permission, Matcha will request your position once to find nearby people. It is not saved until you confirm. You can use manual entry instead.</p><button type="button" className="primary compact" disabled={gps.loading} onClick={gps.request}>{gps.loading ? "Finding your location..." : "Allow location request"}</button></div>}
            {gps.loading && <p role="status">Finding your location...</p>}
            {gps.error && <p role="alert" className="notice error">{gps.error}</p>}
            {gps.position && <div className="notice success"><p role="status">Position ready. Estimated accuracy: {Math.ceil(gps.position.accuracy)} metres. Confirm your city and neighborhood before saving.</p><button type="button" className="text-button" onClick={gps.request}>Locate again</button></div>}
          </>}
          <Field label="City" name="city" autoComplete="address-level2" value={city} onChange={event => setCity(event.target.value)} error={errors.city} hint={mode === "gps" ? "Browser GPS does not supply place names. Confirm the city for your profile." : "Include region or country if your city name is ambiguous."} />
          <Field label="Neighborhood (optional)" name="neighborhood" autoComplete="address-level3" value={neighborhood} onChange={event => setNeighborhood(event.target.value)} error={errors.neighborhood} />
        </section>
        {error instanceof ApiRequestError && error.error.code === ERROR_CODES.VALIDATION_ERROR ? <p role="alert" className="notice error">This location could not be resolved. Check your city and neighborhood, or add region and country. Your previous location has not changed.</p> : <ErrorNotice error={error} />}
        {errors.gps && <p role="alert">{errors.gps}</p>}
        <div className="save-bar"><Link className="secondary" to="/profile">Cancel</Link><button className="primary compact" type="submit" disabled={mode === "gps" && (!gps.position || gps.loading)}>{busy ? "Saving location..." : mode === "gps" ? "Confirm and save location" : "Save location"}</button></div>
      </fieldset>
    </form>
  </>;
}
