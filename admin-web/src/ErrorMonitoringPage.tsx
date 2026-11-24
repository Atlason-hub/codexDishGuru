import React from "react";
import { deleteAppError, fetchAppErrors, updateAppErrorStatus, type AppErrorItem } from "./appErrorsApi";
import { useAuth } from "./auth";

const formatDate = (value: string) => new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium", timeStyle: "short"
}).format(new Date(value));

export default function ErrorMonitoringPage() {
  const { role } = useAuth();
  const [items, setItems] = React.useState<AppErrorItem[]>([]);
  const [status, setStatus] = React.useState("");
  const [platform, setPlatform] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<AppErrorItem | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setItems(await fetchAppErrors({ status, platform, search: search.trim() }));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load errors.");
    } finally {
      setLoading(false);
    }
  }, [platform, search, status]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const changeStatus = async (item: AppErrorItem, nextStatus: AppErrorItem["status"]) => {
    try {
      await updateAppErrorStatus(item.id, nextStatus);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: nextStatus } : entry));
      setSelected((current) => current?.id === item.id ? { ...current, status: nextStatus } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to update error.");
    }
  };

  const remove = async (item: AppErrorItem) => {
    if (!window.confirm("Permanently delete this error record?")) return;
    try {
      await deleteAppError(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setSelected(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to delete error.");
    }
  };

  const openCount = items.filter((item) => item.status === "new" || item.status === "investigating").length;
  const totalOccurrences = items.reduce((sum, item) => sum + item.occurrence_count, 0);

  return (
    <section className="panel error-monitoring">
      <div className="error-monitoring-heading">
        <div>
          <h2>App Errors</h2>
          <p className="muted">Captured mobile crashes and runtime failures, deduplicated by cause.</p>
        </div>
        <button type="button" className="ghost" onClick={() => void load()}>Refresh</button>
      </div>
      <div className="error-summary-grid">
        <div><strong>{openCount}</strong><span>Open errors</span></div>
        <div><strong>{items.length}</strong><span>Unique errors</span></div>
        <div><strong>{totalOccurrences}</strong><span>Occurrences</span></div>
      </div>
      <div className="error-filters">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search message or screen" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
          <option value="ignored">Ignored</option>
        </select>
        <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
          <option value="">All platforms</option>
          <option value="ios">iOS</option>
          <option value="android">Android</option>
          <option value="web">Web</option>
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      {loading ? <p className="muted">Loading errors...</p> : (
        <div className="error-list">
          {items.length === 0 && <div className="reports-empty">No matching errors.</div>}
          {items.map((item) => (
            <button type="button" className="error-list-item" key={item.id} onClick={() => setSelected(item)}>
              <span className={`error-status error-status-${item.status}`}>{item.status}</span>
              <span className="error-message-cell"><strong>{item.error_message}</strong><small>{item.screen || "Unknown screen"} · {item.action || "Unknown action"}</small></span>
              <span>{item.platform || "—"}<small>v{item.app_version || "?"}</small></span>
              <span><strong>{item.occurrence_count}</strong><small>occurrences</small></span>
              <span>{formatDate(item.last_seen_at)}<small>last seen</small></span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="confirm-modal error-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="error-monitoring-heading"><h3>Error details</h3><button type="button" className="ghost" onClick={() => setSelected(null)}>Close</button></div>
            <h4>{selected.error_message}</h4>
            <div className="error-detail-grid">
              <span><b>Status</b>{selected.status}</span><span><b>Occurrences</b>{selected.occurrence_count}</span>
              <span><b>First seen</b>{formatDate(selected.first_seen_at)}</span><span><b>Last seen</b>{formatDate(selected.last_seen_at)}</span>
              <span><b>Screen</b>{selected.screen || "—"}</span><span><b>Action</b>{selected.action || "—"}</span>
              <span><b>Platform</b>{selected.platform || "—"} {selected.os_version || ""}</span><span><b>Version</b>{selected.app_version || "—"} ({selected.build_version || "—"})</span>
              <span><b>User ID</b>{selected.user_id || "Guest"}</span><span><b>Group / company</b>{selected.group_id || selected.company_id || "—"}</span>
            </div>
            {selected.stack_trace && <pre className="error-stack">{selected.stack_trace}</pre>}
            {selected.context && Object.keys(selected.context).length > 0 && <pre className="error-stack">{JSON.stringify(selected.context, null, 2)}</pre>}
            {role === "admin" && <div className="form-actions">
              <select value={selected.status} onChange={(event) => void changeStatus(selected, event.target.value as AppErrorItem["status"])}>
                <option value="new">New</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option><option value="ignored">Ignored</option>
              </select>
              <button type="button" className="danger-button" onClick={() => void remove(selected)}>Delete</button>
            </div>}
          </div>
        </div>
      )}
    </section>
  );
}
