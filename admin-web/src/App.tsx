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
import {
  createCompany,
  deleteCompany,
  fetchCompanies,
  searchCities,
  searchStreets,
  updateCompany,
  uploadCompanyLogo
} from "./companiesApi";
import type { CityOption, Company, StreetOption } from "./companiesTypes";
import { createUser, deleteUser, fetchUsers, updateUser } from "./usersApi";
import type { AdminUser } from "./usersApi";
import { createContent, deleteContent, fetchContent, updateContent } from "./contentApi";
import type { ContentItem } from "./contentApi";
import { createReport, deleteReport, fetchReports, updateReport } from "./reportsApi";
import type { ReportItem } from "./reportsApi";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="panel">Loading...</div>;
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function LoginPage() {
  const { login, user } = useAuth();
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

  React.useEffect(() => {
    if (user) {
      const redirectTo =
        (location.state as { from?: { pathname?: string } } | null)?.from
          ?.pathname || "/";
      navigate(redirectTo, { replace: true });
    }
  }, [location.state, navigate, user]);

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
          <div className="brand-mark">
            <img src="/dishguru-logo.svg" alt="DishGuru logo" />
          </div>
          <div>
            <div className="brand-name">DishGuru</div>
            <div className="brand-sub">Admin Console</div>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/companies">Companies</NavLink>
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
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "viewer">("viewer");
  const [status, setStatus] = React.useState<"active" | "disabled">("active");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchUsers();
        setUsers(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load users.");
      }
    };
    void load();
  }, []);

  const resetForm = () => {
    setFullName("");
    setEmail("");
    setRole("viewer");
    setStatus("active");
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      return;
    }
    try {
      if (editingId) {
        const next = await updateUser(editingId, {
          full_name: fullName.trim(),
          email: email.trim(),
          role,
          status
        });
        setUsers(next);
      } else {
        const newUser = {
          id: crypto.randomUUID(),
          full_name: fullName.trim(),
          email: email.trim(),
          role,
          status
        };
        const next = await createUser(newUser);
        setUsers(next);
      }
      setError(null);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save user.");
    }
  };

  const handleEdit = (user: AdminUser) => {
    setEditingId(user.id);
    setFullName(user.full_name);
    setEmail(user.email);
    setRole(user.role);
    setStatus(user.status);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const next = await deleteUser(id);
      setUsers(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
    }
  };

  return (
    <section className="panel">
      <h2>Users</h2>
      <p className="muted">Create and manage admin users.</p>
      {error && <div className="error">{error}</div>}
      {!showForm && (
        <button type="button" onClick={() => setShowForm(true)}>
          New User
        </button>
      )}
      {showForm && (
        <form onSubmit={handleSubmit} className="form-grid">
          <label className="field">
            <span>Full name</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Avery James"
              required
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="avery@dishguru.com"
              required
            />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as any)}>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
          <div className="form-actions">
            <button type="submit">{editingId ? "Update User" : "Add User"}</button>
            <button type="button" className="ghost" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="table">
        <div className="row header">
          <span>Name</span>
          <span>Email</span>
          <span>Role</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {users.length === 0 && (
          <div className="row">
            <span>No users yet.</span>
            <span />
            <span />
            <span />
            <span />
          </div>
        )}
        {users.map((user) => (
          <div className="row" key={user.id}>
            <span>{user.full_name}</span>
            <span>{user.email}</span>
            <span>{user.role}</span>
            <span>{user.status}</span>
            <span className="row-actions">
              <button type="button" className="ghost" onClick={() => handleEdit(user)}>
                Edit
              </button>
              <button type="button" className="ghost" onClick={() => handleDelete(user.id)}>
                Delete
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ContentPage() {
  const [items, setItems] = React.useState<ContentItem[]>([]);
  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<ContentItem["type"]>("post");
  const [status, setStatus] = React.useState<ContentItem["status"]>("draft");
  const [author, setAuthor] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchContent();
        setItems(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load content.");
      }
    };
    void load();
  }, []);

  const resetForm = () => {
    setTitle("");
    setType("post");
    setStatus("draft");
    setAuthor("");
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !author.trim()) {
      return;
    }
    try {
      if (editingId) {
        const next = await updateContent(editingId, {
          title: title.trim(),
          type,
          status,
          author: author.trim()
        });
        setItems(next);
      } else {
        const newItem: ContentItem = {
          id: crypto.randomUUID(),
          title: title.trim(),
          type,
          status,
          author: author.trim()
        };
        const next = await createContent(newItem);
        setItems(next);
      }
      setError(null);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save content.");
    }
  };

  const handleEdit = (item: ContentItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setType(item.type);
    setStatus(item.status);
    setAuthor(item.author);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const next = await deleteContent(id);
      setItems(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete content.");
    }
  };

  return (
    <section className="panel">
      <h2>Content</h2>
      <p className="muted">Manage curated content across the platform.</p>
      {error && <div className="error">{error}</div>}
      {!showForm && (
        <button type="button" onClick={() => setShowForm(true)}>
          New Content
        </button>
      )}
      {showForm && (
        <form onSubmit={handleSubmit} className="form-grid">
          <label className="field">
            <span>Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summer Menu Highlights"
              required
            />
          </label>
          <label className="field">
            <span>Author</span>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Chef Lina"
              required
            />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="post">Post</option>
              <option value="review">Review</option>
              <option value="recipe">Recipe</option>
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <div className="form-actions">
            <button type="submit">{editingId ? "Update Content" : "Add Content"}</button>
            <button type="button" className="ghost" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="table">
        <div className="row header">
          <span>Title</span>
          <span>Type</span>
          <span>Status</span>
          <span>Author</span>
          <span>Actions</span>
        </div>
        {items.length === 0 && (
          <div className="row">
            <span>No content yet.</span>
            <span />
            <span />
            <span />
            <span />
          </div>
        )}
        {items.map((item) => (
          <div className="row" key={item.id}>
            <span>{item.title}</span>
            <span>{item.type}</span>
            <span>{item.status}</span>
            <span>{item.author}</span>
            <span className="row-actions">
              <button type="button" className="ghost" onClick={() => handleEdit(item)}>
                Edit
              </button>
              <button type="button" className="ghost" onClick={() => handleDelete(item.id)}>
                Delete
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompaniesPage() {
  const { user } = useAuth();
  const MAX_LOGO_BYTES = 200 * 1024;
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [street, setStreet] = React.useState("");
  const [streetId, setStreetId] = React.useState<number | null>(null);
  const [number, setNumber] = React.useState("");
  const generateCompanyKey = () =>
    Math.random().toString(36).slice(2, 8).toUpperCase();
  const [companyKey, setCompanyKey] = React.useState<string>(generateCompanyKey());
  const [orderVendor, setOrderVendor] = React.useState<Company["orderVendor"]>("10bis");
  const [cityQuery, setCityQuery] = React.useState("");
  const [cityId, setCityId] = React.useState<number | null>(null);
  const [logoUrl, setLogoUrl] = React.useState<string | undefined>(undefined);
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [cityOptions, setCityOptions] = React.useState<CityOption[]>([]);
  const [cityLoading, setCityLoading] = React.useState(false);
  const [cityApiError, setCityApiError] = React.useState<string | null>(null);
  const [streetOptions, setStreetOptions] = React.useState<StreetOption[]>([]);
  const [streetLoading, setStreetLoading] = React.useState(false);
  const [streetApiError, setStreetApiError] = React.useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [isCityOpen, setIsCityOpen] = React.useState(false);
  const [isStreetOpen, setIsStreetOpen] = React.useState(false);
  const cityRef = React.useRef<HTMLDivElement | null>(null);
  const streetRef = React.useRef<HTMLDivElement | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const withTimeout = async <T,>(promise: Promise<T>, label: string, ms = 12000) => {
    let timeoutId: number | undefined;
    const timeout = new Promise<T>((_resolve, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(`${label} timed out. Check Supabase settings/RLS.`));
      }, ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    }
  };

  React.useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchCompanies();
        setCompanies(data);
        setApiError(null);
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Failed to load companies.");
      }
    };

    void load();
  }, []);


  const resetForm = () => {
    setName("");
    setDomain("");
    setOrderVendor("10bis");
    setStreet("");
    setStreetId(null);
    setNumber("");
    setCompanyKey(generateCompanyKey());
    setCityQuery("");
    setCityId(null);
    setLogoUrl(undefined);
    setLogoFile(null);
    setLogoError(null);
    setEditingId(null);
    setShowForm(false);
    setSubmitAttempted(false);
    setIsCityOpen(false);
    setIsStreetOpen(false);
    setStreetOptions([]);
    setFormError(null);
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cityRef.current && !cityRef.current.contains(event.target as Node)) {
        setIsCityOpen(false);
      }
      if (streetRef.current && !streetRef.current.contains(event.target as Node)) {
        setIsStreetOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (!showForm) {
      setIsCityOpen(false);
      return;
    }
    if (!cityQuery.trim()) {
      setCityOptions([]);
      setIsCityOpen(false);
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

  React.useEffect(() => {
    if (!showForm) {
      setIsStreetOpen(false);
      return;
    }
    if (!cityId || !street.trim()) {
      setStreetOptions([]);
      setIsStreetOpen(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setStreetLoading(true);
      setStreetApiError(null);
      try {
        const results = await searchStreets(street.trim(), cityId);
        setStreetOptions(results);
      } catch (err) {
        setStreetApiError(err instanceof Error ? err.message : "Street search failed.");
      } finally {
        setStreetLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [cityId, showForm, street]);

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setLogoUrl(undefined);
      setLogoFile(null);
      setLogoError(null);
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoUrl(undefined);
      setLogoFile(null);
      setLogoError("Logo must be under 200 KB.");
      return;
    }
    setLogoError(null);
    setLogoFile(file);
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
    setFormError(null);
    if (!name.trim() || !domain.trim() || !street.trim() || !number.trim()) {
      setFormError("Please fill all required fields.");
      return;
    }
    if (!user) {
      setFormError("You are not authenticated. Please log in again.");
      return;
    }
    let resolvedStreetId = streetId;
    if (!resolvedStreetId && cityId && street.trim()) {
      try {
        const candidates = await searchStreets(street.trim(), cityId);
        const exact = candidates.find(
          (s) => s.Name.trim().toLowerCase() === street.trim().toLowerCase()
        );
        if (exact) {
          resolvedStreetId = exact.Id;
          setStreetId(exact.Id);
        }
      } catch {
        // Keep existing validation behavior below if lookup fails.
      }
    }

    if (!cityId || !cityQuery.trim() || !resolvedStreetId || logoError) {
      if (!cityId) {
        setFormError("Select a city from the list.");
      } else if (!resolvedStreetId) {
        setFormError("Select a street from the list.");
      } else if (logoError) {
        setFormError(logoError);
      }
      return;
    }

    setIsSubmitting(true);
    let finalLogoUrl = logoUrl;
    const newId = editingId ?? crypto.randomUUID();
    if (logoFile) {
      try {
        finalLogoUrl = await withTimeout(
          uploadCompanyLogo(newId, logoFile),
          "Logo upload"
        );
      } catch (_err) {
        setApiError("Logo upload failed or timed out. Saving without logo.");
        // Fall back to saving without logo.
        finalLogoUrl = undefined;
      }
    }

    if (editingId) {
      const updatedCompany: Company = {
        id: editingId,
        companyKey,
        name: name.trim(),
        domain: domain.trim(),
        orderVendor,
        streetId: resolvedStreetId,
        street: street.trim(),
        number: number.trim(),
        cityId,
        cityName: cityQuery.trim(),
        logoUrl: finalLogoUrl
      };
      try {
        const next = await withTimeout(
          updateCompany(editingId, updatedCompany),
          "Update company"
        );
        setCompanies(next);
        setApiError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to update company.";
        setApiError(msg);
        setIsSubmitting(false);
        return;
      }
    } else {
      const newCompany: Company = {
        id: newId,
        companyKey,
        name: name.trim(),
        domain: domain.trim(),
        orderVendor,
        streetId: resolvedStreetId,
        street: street.trim(),
        number: number.trim(),
        cityId,
        cityName: cityQuery.trim(),
        logoUrl: finalLogoUrl
      };
      try {
        const next = await withTimeout(createCompany(newCompany), "Create company");
        setCompanies(next);
        setApiError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create company.";
        setApiError(msg);
        setIsSubmitting(false);
        return;
      }
    }

    resetForm();
    setIsSubmitting(false);
  };

  const handleEdit = (company: Company) => {
    setEditingId(company.id);
    setCompanyKey(company.companyKey);
    setName(company.name);
    setDomain(company.domain);
    setOrderVendor(company.orderVendor);
    setStreetId(company.streetId ?? null);
    setStreet(company.street);
    setNumber(company.number);
    setCityId(company.cityId);
    setCityQuery(company.cityName);
    setLogoUrl(company.logoUrl);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    const confirmed = window.confirm(
      "Delete this company? This action cannot be undone."
    );
    if (!confirmed) {
      return;
    }
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
      {formError && <div className="error">{formError}</div>}
      {!showForm && (
        <button
          type="button"
          className="compact company-new-btn"
          onClick={() => setShowForm(true)}
        >
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
            <span>Order Vendor</span>
            <select
              value={orderVendor}
              onChange={(e) => setOrderVendor(e.target.value as Company["orderVendor"])}
              required
            >
              <option value="10bis">10bis</option>
              <option value="Cibus">Cibus</option>
              <option value="Wolt">Wolt</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label className="field">
            <span>City</span>
            <div className="autocomplete" ref={cityRef}>
              <input
                type="text"
                value={cityQuery}
                dir="auto"
                onChange={(e) => {
                  setCityQuery(e.target.value);
                  setCityId(null);
                  setStreet("");
                  setStreetId(null);
                  setStreetOptions([]);
                  setIsCityOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsCityOpen(false);
                    return;
                  }
                  if (e.key === "Enter" && cityOptions.length > 0) {
                    e.preventDefault();
                    setCityQuery(cityOptions[0].Name);
                    setCityId(cityOptions[0].Id);
                    setStreet("");
                    setStreetId(null);
                    setStreetOptions([]);
                    setCityOptions([]);
                    setIsCityOpen(false);
                  }
                }}
                onFocus={() => setIsCityOpen(true)}
                placeholder="Start typing a city"
                required
              />
              {cityLoading && <div className="muted">Searching...</div>}
              {cityApiError && <div className="error">{cityApiError}</div>}
              {submitAttempted && !cityId && (
                <div className="error">Select a city from the list.</div>
              )}
              {isCityOpen && cityOptions.length > 0 && (
                <div className="dropdown">
                  {cityOptions.map((city) => (
                    <button
                      type="button"
                      key={city.Id}
                      className="dropdown-item"
                      dir="auto"
                      onClick={() => {
                        setCityQuery(city.Name);
                        setCityId(city.Id);
                        setStreet("");
                        setStreetId(null);
                        setStreetOptions([]);
                        setCityOptions([]);
                        setIsCityOpen(false);
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
            <span>Street</span>
            <div className="autocomplete" ref={streetRef}>
              <input
                type="text"
                value={street}
                dir="auto"
                onChange={(e) => {
                  setStreet(e.target.value);
                  setStreetId(null);
                  setIsStreetOpen(true);
                }}
                onFocus={() => setIsStreetOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsStreetOpen(false);
                    return;
                  }
                  if (e.key === "Enter" && streetOptions.length > 0) {
                    e.preventDefault();
                    setStreet(streetOptions[0].Name);
                    setStreetId(streetOptions[0].Id);
                    setStreetOptions([]);
                    setIsStreetOpen(false);
                  }
                }}
                placeholder={cityId ? "Start typing a street" : "Select a city first"}
                disabled={!cityId}
                required
              />
              {!cityId && <div className="muted">Select a city to search streets.</div>}
              {streetLoading && cityId && <div className="muted">Searching streets...</div>}
              {streetApiError && <div className="error">{streetApiError}</div>}
              {isStreetOpen && streetOptions.length > 0 && (
                <div className="dropdown">
                  {streetOptions.map((streetOption) => (
                    <button
                      type="button"
                      key={streetOption.Id}
                      className="dropdown-item"
                      dir="auto"
                      onClick={() => {
                        setStreet(streetOption.Name);
                        setStreetId(streetOption.Id);
                        setStreetOptions([]);
                        setIsStreetOpen(false);
                      }}
                    >
                      {streetOption.Name}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
            <span>Logo</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
            />
          </label>
          {logoError && <div className="error">{logoError}</div>}
          {logoUrl && (
            <div className="logo-preview" aria-label="Logo preview">
              <img src={logoUrl} alt="Company logo preview" />
            </div>
          )}
          <div className="form-actions">
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting && <span className="spinner" aria-hidden="true" />}
              {isSubmitting
                ? "Saving..."
                : editingId
                ? "Update Company"
                : "Add Company"}
            </button>
            <button type="button" className="ghost" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="company-cards">
        {companies.length === 0 && (
          <div className="company-card">
            <div className="muted">No companies yet.</div>
          </div>
        )}
        {companies.map((company) => (
          <article className="company-card" key={company.id}>
            <div className="company-head">
              {company.logoUrl ? (
                <img
                  className="logo-thumb"
                  src={company.logoUrl}
                  alt={`${company.name} logo`}
                />
              ) : (
                <div className="logo-thumb company-logo-fallback">Logo</div>
              )}
              <div className="company-title">
                <strong>{company.name}</strong>
                <span className="muted">{company.domain}</span>
              </div>
            </div>
            <div className="company-fields">
              <div><strong>Vendor:</strong> {company.orderVendor || "—"}</div>
              <div><strong>Address:</strong> {`${company.street || ""} ${company.number || ""}`.trim() || "—"}</div>
              <div dir="auto"><strong>City:</strong> {company.cityName || "—"}</div>
              <div><strong>City ID:</strong> {company.cityId ?? "—"}</div>
              <div><strong>Street ID:</strong> {company.streetId ?? "—"}</div>
            </div>
            <div className="row-actions">
              <button type="button" className="ghost" onClick={() => handleEdit(company)}>
                Edit
              </button>
              <button type="button" className="ghost" onClick={() => handleDelete(company.id)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReportsPage() {
  const [reports, setReports] = React.useState<ReportItem[]>([]);
  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState<ReportItem["category"]>("abuse");
  const [status, setStatus] = React.useState<ReportItem["status"]>("open");
  const [createdBy, setCreatedBy] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchReports();
        setReports(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load reports.");
      }
    };
    void load();
  }, []);

  const resetForm = () => {
    setTitle("");
    setCategory("abuse");
    setStatus("open");
    setCreatedBy("");
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !createdBy.trim()) {
      return;
    }
    try {
      if (editingId) {
        const next = await updateReport(editingId, {
          title: title.trim(),
          category,
          status,
          created_by: createdBy.trim()
        });
        setReports(next);
      } else {
        const newReport: ReportItem = {
          id: crypto.randomUUID(),
          title: title.trim(),
          category,
          status,
          created_by: createdBy.trim()
        };
        const next = await createReport(newReport);
        setReports(next);
      }
      setError(null);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save report.");
    }
  };

  const handleEdit = (report: ReportItem) => {
    setEditingId(report.id);
    setTitle(report.title);
    setCategory(report.category);
    setStatus(report.status);
    setCreatedBy(report.created_by);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const next = await deleteReport(id);
      setReports(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete report.");
    }
  };

  return (
    <section className="panel">
      <h2>Reports</h2>
      <p className="muted">Track safety, performance, and content issues.</p>
      {error && <div className="error">{error}</div>}
      {!showForm && (
        <button type="button" onClick={() => setShowForm(true)}>
          New Report
        </button>
      )}
      {showForm && (
        <form onSubmit={handleSubmit} className="form-grid">
          <label className="field">
            <span>Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="API latency spike"
              required
            />
          </label>
          <label className="field">
            <span>Created by</span>
            <input
              type="text"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              placeholder="System"
              required
            />
          </label>
          <label className="field">
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as any)}>
              <option value="abuse">Abuse</option>
              <option value="performance">Performance</option>
              <option value="content">Content</option>
              <option value="user">User</option>
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="open">Open</option>
              <option value="in_review">In review</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
          <div className="form-actions">
            <button type="submit">{editingId ? "Update Report" : "Add Report"}</button>
            <button type="button" className="ghost" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="table">
        <div className="row header">
          <span>Title</span>
          <span>Category</span>
          <span>Status</span>
          <span>Created by</span>
          <span>Actions</span>
        </div>
        {reports.length === 0 && (
          <div className="row">
            <span>No reports yet.</span>
            <span />
            <span />
            <span />
            <span />
          </div>
        )}
        {reports.map((report) => (
          <div className="row" key={report.id}>
            <span>{report.title}</span>
            <span>{report.category}</span>
            <span>{report.status}</span>
            <span>{report.created_by}</span>
            <span className="row-actions">
              <button type="button" className="ghost" onClick={() => handleEdit(report)}>
                Edit
              </button>
              <button type="button" className="ghost" onClick={() => handleDelete(report.id)}>
                Delete
              </button>
            </span>
          </div>
        ))}
      </div>
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
                  <Route path="/" element={<Navigate to="/companies" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
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
