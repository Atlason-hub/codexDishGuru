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
