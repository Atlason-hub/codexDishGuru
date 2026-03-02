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
import { createCompany, deleteCompany, fetchCompanies, searchCities, updateCompany } from "./companiesApi";
import type { CityOption, Company } from "./companiesTypes";

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

function CompaniesPage() {
  const MAX_LOGO_BYTES = 200 * 1024;
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [street, setStreet] = React.useState("");
  const [number, setNumber] = React.useState("");
  const [cityQuery, setCityQuery] = React.useState("");
  const [cityId, setCityId] = React.useState<number | null>(null);
  const [logoUrl, setLogoUrl] = React.useState<string | undefined>(undefined);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [cityOptions, setCityOptions] = React.useState<CityOption[]>([]);
  const [cityLoading, setCityLoading] = React.useState(false);
  const [cityApiError, setCityApiError] = React.useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  React.useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchCompanies();
        setCompanies(data);
        setApiError(null);
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Failed to load companies.");
      }
      setHasLoaded(true);
    };

    void load();
  }, []);

  React.useEffect(() => {
    if (!hasLoaded) {
      return;
    }
    // No-op: persistence is handled by the local admin API server.
  }, [companies]);

  const resetForm = () => {
    setName("");
    setDomain("");
    setStreet("");
    setNumber("");
    setCityQuery("");
    setCityId(null);
    setLogoUrl(undefined);
    setLogoError(null);
    setEditingId(null);
    setShowForm(false);
    setSubmitAttempted(false);
  };

  React.useEffect(() => {
    if (!showForm) {
      return;
    }
    if (!cityQuery.trim()) {
      setCityOptions([]);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setCityLoading(true);
      setCityApiError(null);
      try {
        const results = await searchCities(cityQuery.trim());
        setCityOptions(results);
      } catch (err) {
        setCityApiError(err instanceof Error ? err.message : "City search failed.");
      } finally {
        setCityLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [cityQuery, showForm]);

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitAttempted(true);
    if (!name.trim() || !domain.trim() || !street.trim() || !number.trim()) {
      return;
    }
    if (!cityId || !cityQuery.trim() || !logoUrl || logoError) {
      return;
    }

    if (editingId) {
      const updatedCompany: Company = {
        id: editingId,
        name: name.trim(),
        domain: domain.trim(),
        street: street.trim(),
        number: number.trim(),
        cityId,
        cityName: cityQuery.trim(),
        logoUrl
      };
      try {
        const next = await updateCompany(editingId, updatedCompany);
        setCompanies(next);
        setApiError(null);
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Failed to update company.");
        return;
      }
    } else {
      const newCompany: Company = {
        id: crypto.randomUUID(),
        name: name.trim(),
        domain: domain.trim(),
        street: street.trim(),
        number: number.trim(),
        cityId,
        cityName: cityQuery.trim(),
        logoUrl
      };
      try {
        const next = await createCompany(newCompany);
        setCompanies(next);
        setApiError(null);
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Failed to create company.");
        return;
      }
    }

    resetForm();
  };

  const handleEdit = (company: Company) => {
    setEditingId(company.id);
    setName(company.name);
    setDomain(company.domain);
    setStreet(company.street);
    setNumber(company.number);
    setCityId(company.cityId);
    setCityQuery(company.cityName);
    setLogoUrl(company.logoUrl);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    const remove = async () => {
      try {
        const next = await deleteCompany(id);
        setCompanies(next);
        setApiError(null);
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Failed to delete company.");
      }
    };
    void remove();
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
      {apiError && <div className="error">{apiError}</div>}
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
            <div className="autocomplete">
              <input
                type="text"
                value={cityQuery}
                onChange={(e) => {
                  setCityQuery(e.target.value);
                  setCityId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && cityOptions.length > 0) {
                    e.preventDefault();
                    setCityQuery(cityOptions[0].Name);
                    setCityId(cityOptions[0].Id);
                    setCityOptions([]);
                  }
                }}
                placeholder="Start typing a city"
                required
              />
              {cityLoading && <div className="muted">Searching...</div>}
              {cityApiError && <div className="error">{cityApiError}</div>}
              {submitAttempted && !cityId && (
                <div className="error">Select a city from the list.</div>
              )}
              {cityOptions.length > 0 && (
                <div className="dropdown">
                  {cityOptions.map((city) => (
                    <button
                      type="button"
                      key={city.Id}
                      className="dropdown-item"
                      onClick={() => {
                        setCityQuery(city.Name);
                        setCityId(city.Id);
                        setCityOptions([]);
                      }}
                    >
                      {city.Name}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
            <span>{company.cityName || "—"}</span>
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
