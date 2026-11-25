import React from "react";
import { useAuth } from "./auth";
import { searchCities, searchStreets } from "./companiesApi";
import type { CityOption, OrderVendor, StreetOption } from "./companiesTypes";
import { createGroup, deleteGroup, fetchGroups, updateGroup, uploadGroupLogo } from "./groupsApi";
import type { Group } from "./groupsTypes";
import { apiFetch } from "./apiClient";

const makeCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const makeKey = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const normalizeAddressValue = (value: string) => value.trim().toLocaleLowerCase();

export default function GroupsPage() {
  const { confirmPassword } = useAuth();
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [joinCode, setJoinCode] = React.useState(makeCode());
  const [groupKey, setGroupKey] = React.useState(makeKey());
  const [orderVendor, setOrderVendor] = React.useState<OrderVendor>("10bis");
  const [cityName, setCityName] = React.useState("");
  const [cityId, setCityId] = React.useState<number | null>(null);
  const [street, setStreet] = React.useState("");
  const [streetId, setStreetId] = React.useState<number | null>(null);
  const [number, setNumber] = React.useState("");
  const [logoUrl, setLogoUrl] = React.useState<string>();
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [cities, setCities] = React.useState<CityOption[]>([]);
  const [streets, setStreets] = React.useState<StreetOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const [membersGroup, setMembersGroup] = React.useState<Group | null>(null);
  const [members, setMembers] = React.useState<Array<{ user_id?: string; email?: string }>>([]);

  React.useEffect(() => {
    fetchGroups().then(setGroups).catch((err) => setError(err instanceof Error ? err.message : "Failed to load groups."));
  }, []);

  React.useEffect(() => {
    if (!showForm || cityName.trim().length < 2) return setCities([]);
    const timer = window.setTimeout(() => {
      searchCities(cityName).then(setCities).catch(() => setCities([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [cityName, showForm]);

  React.useEffect(() => {
    if (!showForm || !cityId || street.trim().length < 2) return setStreets([]);
    const timer = window.setTimeout(() => {
      searchStreets(street, cityId).then(setStreets).catch(() => setStreets([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [cityId, showForm, street]);

  const reset = () => {
    setShowForm(false); setEditingId(null); setName(""); setJoinCode(makeCode()); setGroupKey(makeKey());
    setOrderVendor("10bis"); setCityName(""); setCityId(null); setStreet(""); setStreetId(null);
    setNumber(""); setLogoUrl(undefined); setLogoFile(null); setCities([]); setStreets([]); setError(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !joinCode.trim() || !cityName.trim() || !street.trim() || !number.trim()) {
      setError("Complete all required fields.");
      return;
    }
    setSaving(true); setError(null);
    const id = editingId ?? crypto.randomUUID();
    try {
      let resolvedCityId = cityId;
      if (!resolvedCityId) {
        const candidates = await searchCities(cityName.trim());
        const exact = candidates.find(
          (city) => normalizeAddressValue(city.Name) === normalizeAddressValue(cityName)
        );
        resolvedCityId = exact?.Id ?? null;
        if (resolvedCityId) setCityId(resolvedCityId);
      }
      if (!resolvedCityId) {
        throw new Error("Select a city from the suggestions.");
      }

      let resolvedStreetId = streetId;
      if (!resolvedStreetId) {
        const candidates = await searchStreets(street.trim(), resolvedCityId);
        const exact = candidates.find(
          (candidate) => normalizeAddressValue(candidate.Name) === normalizeAddressValue(street)
        );
        resolvedStreetId = exact?.Id ?? null;
        if (resolvedStreetId) setStreetId(resolvedStreetId);
      }
      if (!resolvedStreetId) {
        throw new Error("Select a street from the suggestions.");
      }

      const finalLogo = logoFile ? await uploadGroupLogo(id, logoFile) : logoUrl;
      const group: Group = {
        id, groupKey, name: name.trim(), joinCode: joinCode.trim().toUpperCase(), usersCount: groups.find((g) => g.id === id)?.usersCount ?? 0,
        orderVendor, cityId: resolvedCityId, cityName: cityName.trim(), streetId: resolvedStreetId, street: street.trim(), number: number.trim(), logoUrl: finalLogo
      };
      setGroups(editingId ? await updateGroup(id, group) : await createGroup(group));
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save group.");
    } finally { setSaving(false); }
  };

  const edit = (group: Group) => {
    setEditingId(group.id); setName(group.name); setJoinCode(group.joinCode); setGroupKey(group.groupKey);
    setOrderVendor(group.orderVendor); setCityName(group.cityName); setCityId(group.cityId);
    setStreet(group.street); setStreetId(group.streetId ?? null); setNumber(group.number);
    setLogoUrl(group.logoUrl); setLogoFile(null); setShowForm(true); setError(null);
  };

  const confirmDelete = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deleteId) return;
    setDeleting(true); setError(null);
    try {
      await confirmPassword(password);
      setGroups(await deleteGroup(deleteId));
      setDeleteId(null); setPassword("");
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to delete group."); }
    finally { setDeleting(false); }
  };

  const openMembers = async (group: Group) => {
    setMembersGroup(group); setMembers([]);
    try {
      const response = await apiFetch(`/api/group-users?groupId=${encodeURIComponent(group.id)}`);
      if (!response.ok) throw new Error(await response.text());
      setMembers(await response.json() as Array<{ user_id?: string; email?: string }>);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load members."); }
  };

  const formatDate = (value?: string) => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

  return (
    <section className="panel">
      <h2>Groups</h2>
      <p className="muted">Manage code-based sharing groups, logos and delivery addresses.</p>
      {error && <div className="error">{error}</div>}
      {!showForm && <button type="button" className="compact company-new-btn" onClick={() => setShowForm(true)}>New Group</button>}
      {showForm && (
        <form onSubmit={save} className="form-grid">
          <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label className="field"><span>Join code</span><div className="inline-field"><input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} required /><button type="button" className="ghost" onClick={() => setJoinCode(makeCode())}>Generate</button></div></label>
          <label className="field"><span>Order Vendor</span><select value={orderVendor} onChange={(e) => setOrderVendor(e.target.value as OrderVendor)}><option>10bis</option><option>Cibus</option><option>Wolt</option><option>Other</option></select></label>
          <label className="field"><span>City</span><input list="group-cities" value={cityName} onChange={(e) => { setCityName(e.target.value); const match = cities.find((c) => c.Name === e.target.value); setCityId(match?.Id ?? null); setStreet(""); setStreetId(null); }} required /><datalist id="group-cities">{cities.map((c) => <option key={c.Id} value={c.Name} />)}</datalist></label>
          <label className="field"><span>Street</span><input list="group-streets" value={street} disabled={!cityId} onChange={(e) => { setStreet(e.target.value); const match = streets.find((s) => s.Name === e.target.value); setStreetId(match?.Id ?? null); }} required /><datalist id="group-streets">{streets.map((s) => <option key={s.Id} value={s.Name} />)}</datalist></label>
          <label className="field"><span>Number</span><input value={number} onChange={(e) => setNumber(e.target.value)} required /></label>
          <label className="field logo-upload-field"><span>Logo</span><input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0] ?? null; setLogoFile(file); if (file) setLogoUrl(URL.createObjectURL(file)); }} /></label>
          <div className="company-form-footer">{logoUrl && <div className="logo-preview"><img src={logoUrl} alt="Group logo preview" /></div>}<div className="form-actions company-form-actions"><button type="submit" disabled={saving}>{saving ? "Saving..." : editingId ? "Update Group" : "Add Group"}</button><button type="button" className="ghost" onClick={reset}>Cancel</button></div></div>
        </form>
      )}
      <div className="company-table-shell"><div className="company-table group-table">
        <div className="company-table-row company-table-header"><span>Group</span><span>#Users</span><span>Code</span><span>Vendor</span><span>Address</span><span>City</span><span>Created</span><span>Actions</span></div>
        {groups.length === 0 && <div className="company-table-empty muted">No code-based groups yet.</div>}
        {groups.map((group) => <article className="company-table-row company-table-item" key={group.id}>
          <div className="company-cell company-company-cell" data-label="Group"><div className="company-identity"><div className="company-title"><strong>{group.name}</strong><span className="muted">Code group</span></div>{group.logoUrl ? <img className="logo-thumb" src={group.logoUrl} alt={`${group.name} logo`} /> : <div className="logo-thumb company-logo-fallback">Logo</div>}</div></div>
          <div className="company-cell company-users-cell" data-label="#Users"><button type="button" className="users-count users-count-button" onClick={() => void openMembers(group)}>{group.usersCount}</button></div>
          <div className="company-cell group-code-cell" data-label="Code">{group.joinCode}</div>
          <div className="company-cell" data-label="Vendor"><span className="vendor-badge">{group.orderVendor}</span></div>
          <div className="company-cell" data-label="Address">{group.street} {group.number}</div>
          <div className="company-cell" data-label="City">{group.cityName}</div>
          <div className="company-cell" data-label="Created">{formatDate(group.createdAt)}</div>
          <div className="company-cell company-actions-cell" data-label="Actions"><div className="row-actions"><button type="button" className="ghost" onClick={() => edit(group)}>Edit</button><button type="button" className="ghost" onClick={() => { setDeleteId(group.id); setPassword(""); }}>Delete</button></div></div>
        </article>)}
      </div></div>
      {deleteId && <div className="modal-overlay" onClick={() => setDeleteId(null)}><div className="confirm-modal" onClick={(e) => e.stopPropagation()}><h3>Confirm Group Deletion</h3><p className="muted">Enter your login password to delete this group. Members will return to email-domain grouping.</p><form className="form" onSubmit={confirmDelete}><label className="field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus /></label><div className="form-actions"><button type="submit" disabled={deleting}>{deleting ? "Deleting..." : "Delete Group"}</button><button type="button" className="ghost" onClick={() => setDeleteId(null)}>Cancel</button></div></form></div></div>}
      {membersGroup && <div className="modal-overlay" onClick={() => setMembersGroup(null)}><div className="confirm-modal users-modal" onClick={(e) => e.stopPropagation()}><h3>{membersGroup.name} Users</h3><p className="muted">Users who joined with this group code.</p><div className="users-list">{members.length ? members.map((member, index) => <div className="users-list-item" key={`${member.user_id}-${index}`}>{member.email || member.user_id}</div>) : <div className="muted">No group members yet.</div>}</div><div className="form-actions"><button type="button" className="ghost" onClick={() => setMembersGroup(null)}>Close</button></div></div></div>}
    </section>
  );
}
