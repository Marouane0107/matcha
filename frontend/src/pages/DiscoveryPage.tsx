import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import type { PaginatedData, ProfileSearchResult, SearchQuery, Tag } from "@matcha/shared";
import { ERROR_CODES } from "@matcha/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice, Field } from "../features/auth/components/Form";
import { useProfileService } from "../features/profile/ProfileProvider";
import { ProfileImage } from "../features/profile/components";
import { toggleTag } from "../features/profile/validation";
import { ApiRequestError } from "../services/api/client";
import { useDiscoveryService } from "../features/discovery/DiscoveryProvider";
import { searchErrors, sortLabels } from "../features/discovery/validation";

const numericFilters = { minAge: "Minimum age", maxAge: "Maximum age", maxDistance: "Maximum distance (km)", minFame: "Minimum fame", maxFame: "Maximum fame" } as const;
type FilterKey = keyof typeof numericFilters;
const blank = { minAge: "", maxAge: "", maxDistance: "", minFame: "", maxFame: "" };

function ResultCard({ profile }: { profile: ProfileSearchResult }) {
  const main = profile.pictures.find(picture => picture.isMain);
  return <article className="discovery-card">
    <div className="discovery-photo">{main ? <ProfileImage picture={main} alt={`${profile.firstName}'s main profile photo`} /> : <div className="photo-fallback">No photo available</div>}</div>
    <div className="discovery-card-body"><h2><Link to={`/profiles/${encodeURIComponent(profile.username)}`}>{profile.firstName}{profile.age !== null && `, ${profile.age}`}</Link></h2><p className="muted">@{profile.username}</p>
      <p>{profile.location ? [profile.location.city, profile.location.neighborhood].filter(Boolean).join(" / ") : "Location not shared"}</p>
      <dl className="discovery-facts"><div><dt>Distance</dt><dd>{profile.distanceKm} km</dd></div><div><dt>Fame</dt><dd>{profile.fameRating} / 100</dd></div><div><dt>Common interests</dt><dd>{profile.commonTags}</dd></div></dl>
      <ul className="tag-list" aria-label="Interests">{profile.tags.map(tag => <li key={tag.id}>#{tag.name}</li>)}</ul>
    </div>
  </article>;
}

export default function DiscoveryPage({ mode }: { mode: "suggestions" | "search" }) {
  const { accessToken } = useAuth();
  const service = useDiscoveryService();
  const profiles = useProfileService();
  const [draft, setDraft] = useState(blank);
  const [selected, setSelected] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SearchQuery["sortBy"]>();
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [query, setQuery] = useState<SearchQuery>({ page: 1, limit: 12 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [tagError, setTagError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [tagAttempt, setTagAttempt] = useState(0);
  const [state, setState] = useState<{ token: string | null; data: PaginatedData<ProfileSearchResult> | null; loading: boolean; error: unknown }>({ token: null, data: null, loading: true, error: null });
  useEffect(() => {
    let active = true;
    setTags(null); setTagError(null);
    if (accessToken) void profiles.tags(accessToken).then(value => { if (active) setTags(value); }, error => { if (active) setTagError(error); });
    return () => { active = false; };
  }, [profiles, accessToken, tagAttempt]);
  useEffect(() => {
    let active = true;
    setState({ token: accessToken, data: null, error: null, loading: true });
    if (accessToken) void service[mode](query, accessToken).then(data => { if (active) setState({ token: accessToken, data, loading: false, error: null }); }, error => { if (active) setState({ token: accessToken, data: null, loading: false, error }); });
    return () => { active = false; };
  }, [service, mode, query, accessToken, attempt]);
  function submit(event: FormEvent) {
    event.preventDefault();
    const next: SearchQuery = { page: 1, limit: 12, tags: selected, ...(sortBy ? { sortBy, sortOrder } : {}) };
    for (const key of Object.keys(numericFilters) as FilterKey[]) if (draft[key].trim()) next[key] = Number(draft[key]);
    const invalid = searchErrors(next);
    setErrors(invalid);
    if (!Object.keys(invalid).length) setQuery(next);
  }
  const data = state.token === accessToken ? state.data : null;
  const eligibility = state.error instanceof ApiRequestError && (state.error.error.code === ERROR_CODES.PROFILE_INCOMPLETE || state.error.error.code === ERROR_CODES.LOCATION_REQUIRED);
  return <>
    <div className="page-toolbar"><div><p className="eyebrow">People nearby</p><h1 tabIndex={-1}>{mode === "suggestions" ? "Browse" : "Advanced search"}</h1></div></div>
    <form onSubmit={submit} noValidate className="discovery-filters" aria-label="Profile filters">
      <div className="discovery-filter-grid">{(Object.entries(numericFilters) as [FilterKey, string][]).map(([key, label]) => <Field key={key} label={label} name={key} type="number" min={key.endsWith("Age") ? 18 : 0} max={key.endsWith("Age") ? 120 : key === "maxDistance" ? 20000 : 100} step={key.endsWith("Age") ? 1 : "any"} value={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} error={errors[key]} />)}
        <div className="field"><label htmlFor="discovery-sort">Sort by</label><select id="discovery-sort" value={sortBy ?? ""} onChange={event => setSortBy(event.target.value ? event.target.value as SearchQuery["sortBy"] : undefined)}><option value="">{mode === "suggestions" ? "Suggested order" : "Default distance"}</option>{Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor="discovery-order">Order</label><select id="discovery-order" disabled={!sortBy} value={sortOrder} onChange={event => setSortOrder(event.target.value as "asc" | "desc")}><option value="asc">Ascending</option><option value="desc">Descending</option></select></div>
      </div>
      <fieldset className="discovery-tags"><legend>Interests</legend>{tagError ? <><ErrorNotice error={tagError} /><button type="button" className="secondary" onClick={() => setTagAttempt(value => value + 1)}>Retry interests</button></> : !tags ? <p role="status">Loading interests...</p> : <div className="tag-options">{tags.map(tag => <label key={tag.id} className={selected.includes(tag.id) ? "selected" : ""}><input type="checkbox" checked={selected.includes(tag.id)} disabled={selected.length >= 10 && !selected.includes(tag.id)} onChange={() => setSelected(current => toggleTag(current, tag.id))} />{tag.name}</label>)}</div>}{errors.tags && <p role="alert">{errors.tags}</p>}</fieldset>
      <div className="action-row"><button className="primary compact" type="submit">{mode === "search" ? "Search" : "Apply filters"}</button><button className="secondary" type="button" onClick={() => { setDraft(blank); setSelected([]); setSortBy(undefined); setSortOrder("asc"); setErrors({}); setQuery({ page: 1, limit: 12 }); }}>Reset</button></div>
    </form>
    <section aria-label="Profile results" aria-busy={state.loading} className="discovery-results">
      {state.loading || state.token !== accessToken ? <p role="status">Loading profiles...</p> : state.error ? <div className="profile-empty">{eligibility ? <><h2>Complete your profile to discover people</h2><p>A saved location and complete profile are required.</p><div className="action-row"><Link to="/profile">Review profile</Link><Link to="/profile/location">Update location</Link></div></> : <><ErrorNotice error={state.error} /></>}<button className="secondary" onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : data && <>
        <p role="status">{data.pagination.total} {data.pagination.total === 1 ? "profile" : "profiles"} found</p>
        {!data.items.length ? <div className="profile-empty"><h2>No profiles found</h2><p>Try widening your criteria.</p></div> : <div className="discovery-grid">{data.items.map(profile => <ResultCard key={profile.id} profile={profile} />)}</div>}
        <nav className="discovery-pagination" aria-label="Result pages"><button className="secondary" disabled={data.pagination.page <= 1} onClick={() => setQuery(current => ({ ...current, page: data.pagination.page - 1 }))}>Previous</button><span>Page {data.pagination.page} of {Math.max(1, data.pagination.totalPages)}</span><button className="secondary" disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => setQuery(current => ({ ...current, page: data.pagination.page + 1 }))}>Next</button></nav>
      </>}
    </section>
  </>;
}
