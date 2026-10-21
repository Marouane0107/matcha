import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";
import type { Picture } from "@matcha/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice, useTask } from "../features/auth/components/Form";
import { useProfileService } from "../features/profile/ProfileProvider";
import { LoadState, ProfileImage, useOwnerProfile } from "../features/profile/components";
import { pictureError } from "../features/profile/validation";

function PictureManager({ initial }: { initial: Picture[] }) {
  const service = useProfileService();
  const { accessToken } = useAuth();
  const [pictures, setPictures] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState("");
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const task = useTask();
  useEffect(() => {
    setReady(false);
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function select(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    const error = pictureError(selected, pictures.length);
    setInvalid(error ?? ""); setMessage(""); setReady(false); setFile(error ? null : selected);
  }
  return <>
    <ErrorNotice error={task.error} />{invalid && <p className="notice error" role="alert">{invalid}</p>}{message && <p className="notice success" role="status">{message}</p>}
    <div className="photo-manager-grid">{pictures.map(picture => <figure className="photo-tile" key={picture.id}><div className="photo-image"><ProfileImage picture={picture} alt={`Your photo ${picture.position}`} /></div><figcaption><strong>{picture.isMain ? "Main photo" : `Photo ${picture.position}`}</strong><div className="photo-actions"><button className="secondary" disabled={task.busy || picture.isMain} onClick={() => void task.run(async () => { if (!accessToken) return; setMessage(""); const result = await service.setMain(picture.id, accessToken); setPictures(result.pictures); setMessage("Main photo updated."); })}>Make main</button><button className="text-button danger" disabled={task.busy} onClick={() => setDeleting(picture.id)}>Remove<span className="sr-only"> photo {picture.position}</span></button></div>{deleting === picture.id && <div className="delete-confirm" role="group" aria-label="Confirm photo removal"><p>Remove this photo?</p><button className="secondary" disabled={task.busy} onClick={() => setDeleting(null)}>Keep</button><button className="secondary danger" disabled={task.busy} onClick={() => void task.run(async () => { if (!accessToken) return; setMessage(""); const result = await service.remove(picture.id, accessToken); setPictures(result.pictures); setDeleting(null); setMessage("Photo removed."); })}>Confirm removal</button></div>}</figcaption></figure>)}</div>
    <section className="upload-section"><h2>{pictures.length ? "Another side of you" : "Start with a photo"}</h2><p className="muted">{pictures.length} of 5 photos. JPEG, PNG or WebP, up to 5 MiB and 20 megapixels each.</p>
      <label className="field upload-input">Choose a photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={task.busy || pictures.length >= 5} onChange={select} /></label>
      {pictures.length >= 5 && <p role="status">All five photo spaces are filled. Remove one to add another.</p>}
      {file && preview && <div className="upload-preview"><img src={preview} alt="Selected photo preview" onLoad={event => { if (event.currentTarget.naturalWidth * event.currentTarget.naturalHeight > 20000000) { setInvalid("Choose an image no larger than 20 megapixels."); setReady(false); } else setReady(true); }} onError={() => { setInvalid("This image could not be decoded. Choose a different image."); setReady(false); }} /><div><p>{file.name}</p><p className="muted">{(file.size / 1024 / 1024).toFixed(2)} MiB</p><div className="action-row"><button className="primary compact" disabled={task.busy || !ready || pictures.length >= 5} onClick={() => void task.run(async () => { if (!accessToken) return; setMessage(""); const result = await service.upload(file, accessToken); setPictures(result.pictures); setFile(null); setMessage("Your photo has been uploaded."); })}>{task.busy ? "Uploading..." : "Upload photo"}</button><button className="secondary" disabled={task.busy} onClick={() => { setFile(null); setInvalid(""); }}>Cancel</button></div></div></div>}
      {task.busy && <p role="status">Updating your photos...</p>}
    </section>
  </>;
}

export default function PicturesPage() {
  const resource = useOwnerProfile();
  return <><div className="page-toolbar"><div><p className="eyebrow">Your best moments</p><h1 tabIndex={-1}>Your photos</h1></div><Link className="secondary" to="/profile">Back to profile</Link></div><p className="intro">A main photo makes it easier to say hello.</p>{resource.data ? <PictureManager initial={resource.data.pictures} /> : <LoadState loading={resource.loading} error={resource.error} retry={resource.reload} />}</>;
}
