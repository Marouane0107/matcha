import { useState } from "react";
import { Link } from "react-router-dom";
import { LoadState, useOwnerProfile } from "../features/profile/components";
import LocationSelector from "../features/location/LocationSelector";

export default function LocationPage() {
  const resource = useOwnerProfile();
  const [saved, setSaved] = useState(false);
  return <div className="editor-width"><p className="eyebrow">Close to home</p><h1 tabIndex={-1}>Your location</h1>
    {saved && resource.data && <p className="notice success" role="status">Location saved. Your profile has been refreshed. <Link to="/profile">View your profile</Link></p>}
    {resource.data ? <><p className="intro">{resource.data.location ? [resource.data.location.city, resource.data.location.neighborhood].filter(Boolean).join(" / ") : "No location saved yet."}</p><LocationSelector profile={resource.data} onSaved={() => { setSaved(true); resource.reload(); }} /></> : <LoadState loading={resource.loading} error={resource.error} retry={resource.reload} />}
  </div>;
}
