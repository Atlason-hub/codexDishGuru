import React from "react";
import {
  Navigate,
  Route,
  Routes,
  NavLink,
  useLocation,
  useNavigate
} from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      const redirectTo =
        (location.state as { from?: { pathname?: string } } | null)?.from
          ?.pathname || "/";
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="logo">DishGuru Admin</div>
        <h1>Sign in</h1>
        <p className="muted">Access the control room.</p>
        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@dishguru.com"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
      <div className="login-ambient" aria-hidden="true" />
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">DG</div>
          <div>
            <div className="brand-name">DishGuru</div>
            <div className="brand-sub">Admin Console</div>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/users">Users</NavLink>
          <NavLink to="/companies">Companies</NavLink>
          <NavLink to="/content">Content</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <button className="ghost" onClick={logout}>
          Sign out
        </button>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <div className="topbar-title">Welcome back</div>
            <div className="muted">Monitor activity and shape the platform.</div>
          </div>
          <div className="topbar-chip">Live</div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

function Card({ title, value, meta }: { title: string; value: string; meta: string }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="card-value">{value}</div>
      <div className="card-meta">{meta}</div>
    </div>
  );
}

function DashboardPage() {
  return (
    <div className="grid">
      <Card title="Active Sessions" value="142" meta="+12% vs last week" />
      <Card title="Reported Items" value="9" meta="2 pending review" />
      <Card title="New Signups" value="48" meta="Peak at 4pm" />
      <Card title="Support Queue" value="5" meta="All within SLA" />
      <section className="panel">
        <h2>Activity Pulse</h2>
        <p className="muted">
          Real-time moderation and user events will render here once the backend is
          wired.
        </p>
        <div className="pulse">
          <div />
          <div />
          <div />
          <div />
        </div>
      </section>
      <section className="panel">
        <h2>Quick Actions</h2>
        <div className="actions">
          <button>Review reports</button>
          <button className="ghost">Manage roles</button>
          <button className="ghost">Export logs</button>
        </div>
      </section>
    </div>
  );
}

function UsersPage() {
  return (
    <section className="panel">
      <h2>Users</h2>
      <p className="muted">List, suspend, or promote users once the API is ready.</p>
      <div className="table">
        <div className="row header">
          <span>Name</span>
          <span>Role</span>
          <span>Status</span>
          <span>Last active</span>
        </div>
        {[
          ["Avery James", "Moderator", "Active", "2h ago"],
          ["Sam Lee", "Admin", "Active", "10m ago"],
          ["Riley Chen", "User", "Flagged", "1d ago"]
        ].map((row) => (
          <div className="row" key={row[0]}>
            {row.map((cell) => (
              <span key={cell}>{cell}</span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function ContentPage() {
  return (
    <section className="panel">
      <h2>Content</h2>
      <p className="muted">Approve, archive, or feature content here.</p>
      <div className="pill-grid">
        <div>
          <div className="pill">24 pending approvals</div>
          <div className="pill ghost">7 flagged items</div>
        </div>
        <div>
          <div className="pill">3 scheduled promotions</div>
          <div className="pill ghost">8 drafts in queue</div>
        </div>
      </div>
    </section>
  );
}

type Company = {
  id: string;
  name: string;
  domain: string;
  street: string;
  number: string;
  city: string;
  logoUrl?: string;
};

const IDB_NAME = "dg_admin";
const IDB_STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const request = store.get(key);
    request.onsuccess = () => resolve((request.result as string) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function CompaniesPage() {
  const STORAGE_KEY = "dg_admin_companies";
  const MAX_LOGO_BYTES = 200 * 1024;
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [street, setStreet] = React.useState("");
  const [number, setNumber] = React.useState("");
  const [city, setCity] = React.useState("");
  const [logoUrl, setLogoUrl] = React.useState<string | undefined>(undefined);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const [storageError, setStorageError] = React.useState<string | null>(null);
  const [storageStatus, setStorageStatus] = React.useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = React.useState(false);

  React.useEffect(() => {
    const load = async () => {
      let loadedFrom: string | null = null;
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          loadedFrom = "localStorage";
        }
      } catch {
        // Ignore localStorage access errors.
      }

      if (!stored && "indexedDB" in window) {
        try {
          stored = await idbGet(STORAGE_KEY);
          if (stored) {
            loadedFrom = "IndexedDB";
          }
        } catch {
          // Ignore IndexedDB errors.
        }
      }

      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Company[];
          if (Array.isArray(parsed)) {
            setCompanies(parsed);
            setStorageStatus(null);
          }
        } catch {
          // Ignore malformed data.
        }
      } else {
        setStorageStatus(null);
      }

      setHasLoaded(true);
    };

    void load();
  }, []);

  React.useEffect(() => {
    if (!hasLoaded) {
      return;
    }
    const payload = JSON.stringify(companies);
    let localOk = false;
    try {
      window.localStorage.setItem(STORAGE_KEY, payload);
      localOk = true;
    } catch {
      localOk = false;
    }

    if ("indexedDB" in window) {
      void idbSet(STORAGE_KEY, payload)
        .then(() => {
          setStorageStatus(null);
          if (storageError) {
            setStorageError(null);
          }
        })
        .catch(() => {
          if (localOk) {
            setStorageStatus(null);
            setStorageError(null);
          } else {
            setStorageError("Could not save companies in this browser.");
          }
        });
    } else if (localOk) {
      setStorageStatus(null);
      if (storageError) {
        setStorageError(null);
      }
    } else {
      setStorageError("Could not save companies in this browser.");
    }
  }, [companies]);

  const resetForm = () => {
    setName("");
    setDomain("");
    setStreet("");
    setNumber("");
    setCity("");
    setLogoUrl(undefined);
    setLogoError(null);
    setEditingId(null);
    setShowForm(false);
  };

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setLogoUrl(undefined);
      setLogoError(null);
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoUrl(undefined);
      setLogoError("Logo must be under 200 KB.");
      return;
    }
    setLogoError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !name.trim() ||
      !domain.trim() ||
      !street.trim() ||
      !number.trim() ||
      !city.trim() ||
      !logoUrl ||
      logoError
    ) {
      return;
    }

    if (editingId) {
      setCompanies((prev) =>
        prev.map((company) =>
          company.id === editingId
            ? {
                ...company,
                name: name.trim(),
                domain: domain.trim(),
                street: street.trim(),
                number: number.trim(),
                city: city.trim(),
                logoUrl
              }
            : company
        )
      );
    } else {
      const newCompany: Company = {
        id: crypto.randomUUID(),
        name: name.trim(),
        domain: domain.trim(),
        street: street.trim(),
        number: number.trim(),
        city: city.trim(),
        logoUrl
      };
      setCompanies((prev) => [newCompany, ...prev]);
    }

    resetForm();
  };

  const handleEdit = (company: Company) => {
    setEditingId(company.id);
    setName(company.name);
    setDomain(company.domain);
    setStreet(company.street);
    setNumber(company.number);
    setCity(company.city);
    setLogoUrl(company.logoUrl);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setCompanies((prev) => prev.filter((company) => company.id !== id));
    if (editingId === id) {
      resetForm();
    }
  };

  return (
    <section className="panel">
      <h2>Companies</h2>
      <p className="muted">
        Add and manage company profiles for accounts and partnerships.
      </p>
      {storageError && <div className="error">{storageError}</div>}
      {!showForm && (
        <button type="button" onClick={() => setShowForm(true)}>
          New Company
        </button>
      )}
      {showForm && (
        <form onSubmit={handleSubmit} className="form-grid">
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Foods"
              required
            />
          </label>
          <label className="field">
            <span>Domain</span>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="acmefoods.com"
              required
            />
          </label>
          <label className="field">
            <span>Street</span>
            <input
              type="text"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Main St"
              required
            />
          </label>
          <label className="field">
            <span>Number</span>
            <input
              type="text"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="123"
              required
            />
          </label>
          <label className="field">
            <span>City</span>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Austin"
              required
            />
          </label>
          <label className="field">
            <span>Logo</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              required={!logoUrl}
            />
          </label>
          {logoError && <div className="error">{logoError}</div>}
          {logoUrl && (
            <div className="logo-preview" aria-label="Logo preview">
              <img src={logoUrl} alt="Company logo preview" />
            </div>
          )}
          <div className="form-actions">
            <button type="submit">{editingId ? "Update Company" : "Add Company"}</button>
            <button type="button" className="ghost" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="table">
        <div className="row header">
          <span>Name</span>
          <span>Domain</span>
          <span>Street</span>
          <span>Number</span>
          <span>City</span>
          <span>Logo</span>
          <span>Actions</span>
        </div>
        {companies.length === 0 && (
          <div className="row">
            <span>No companies yet.</span>
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        )}
        {companies.map((company) => (
          <div className="row" key={company.id}>
            <span>{company.name}</span>
            <span>{company.domain}</span>
            <span>{company.street || "—"}</span>
            <span>{company.number || "—"}</span>
            <span>{company.city || "—"}</span>
            <span>
              {company.logoUrl ? (
                <img
                  className="logo-thumb"
                  src={company.logoUrl}
                  alt={`${company.name} logo`}
                />
              ) : (
                "—"
              )}
            </span>
            <span className="row-actions">
              <button type="button" className="ghost" onClick={() => handleEdit(company)}>
                Edit
              </button>
              <button type="button" className="ghost" onClick={() => handleDelete(company.id)}>
                Delete
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportsPage() {
  return (
    <section className="panel">
      <h2>Reports</h2>
      <p className="muted">Monitor abuse, safety, and performance incidents.</p>
      <ul className="report-list">
        <li>
          <strong>Abuse report</strong>
          <span>Awaiting review • 12m ago</span>
        </li>
        <li>
          <strong>Performance alert</strong>
          <span>API latency spike • 3h ago</span>
        </li>
        <li>
          <strong>Content dispute</strong>
          <span>User appealed decision • 1d ago</span>
        </li>
      </ul>
    </section>
  );
}

function SettingsPage() {
  return (
    <section className="panel">
      <h2>Settings</h2>
      <p className="muted">Configure roles, notifications, and integrations.</p>
      <div className="settings-grid">
        <div className="setting">
          <span>Role Templates</span>
          <button className="ghost">Edit</button>
        </div>
        <div className="setting">
          <span>Notification Rules</span>
          <button className="ghost">Edit</button>
        </div>
        <div className="setting">
          <span>Audit Exports</span>
          <button className="ghost">Configure</button>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/companies" element={<CompaniesPage />} />
                  <Route path="/content" element={<ContentPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
