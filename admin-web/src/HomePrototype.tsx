import React from "react";

type Dish = { id: number; title: string; restaurant: string; date: string; image: string; tasty: number; filling: number; mine?: boolean };

const dishes: Dish[] = [
  { id: 1, title: "מקאו טופו 🌶️🥜🌾", restaurant: "ג'פניקה אוניברסיטה", date: "6/9/2026", image: "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=1000&q=88", tasty: 4, filling: 5 },
  { id: 2, title: "ארוחת קציצות בקר (חי בריא) ברוטב עגבניות ו...", restaurant: "גוטה בריא ומהיר | יגאל אלון", date: "5/11/2026", image: "https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=1000&q=88", tasty: 3, filling: 3, mine: true },
  { id: 3, title: "סלט שוק וגבינת עיזים", restaurant: "קפה נואר | אחד העם", date: "4/11/2026", image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1000&q=88", tasty: 5, filling: 3 },
];

const moods = ["😖", "😣", "🙁", "🙂", "😋"];

function RatingRow({ label, value }: { label: string; value: number }) {
  return <div className="visual-rating-row"><strong>{label}</strong><div className="visual-moods" aria-label={`${label}: ${value} מתוך 5`}>{moods.map((mood, index) => <span key={`${label}-${index}`} className={index + 1 === value ? "selected" : ""}>{mood}</span>)}</div></div>;
}

export default function HomePrototype() {
  const [tab, setTab] = React.useState<"dishes" | "restaurants">("dishes");
  const [liked, setLiked] = React.useState<number[]>([]);
  const [query, setQuery] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Dish | null>(null);
  const visibleDishes = dishes.filter((dish) => `${dish.title} ${dish.restaurant}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="home-prototype-page visual-only-prototype" dir="rtl">
    <aside className="prototype-notes" dir="ltr">
      <div className="prototype-kicker">DishGuru / Visual refresh</div>
      <h1>Same product. Clearer hierarchy and a more confident food identity.</h1>
      <p>No features were added or removed. This concept keeps the current header, search, dishes/restaurants tabs, dish actions, ratings, order action and camera entry point.</p>
      <div className="prototype-principles"><span>Current structure preserved</span><span>Hebrew-first</span><span>Stronger photography</span><span>Cleaner visual rhythm</span></div>
      <a href="/companies" className="prototype-exit">Return to admin</a>
    </aside>

    <main className="phone-stage"><div className="prototype-phone visual-phone">
      <div className="prototype-status" dir="ltr"><span>8:19</span><span>◉ ᯤ 5G ▰</span></div>
      <header className="visual-header">
        <button className="visual-search-button" aria-label="חיפוש" onClick={() => setSearchOpen((open) => !open)}>⌕</button>
        <div className="visual-brand"><span className="visual-group-logo"><i /><i /><i /></span><strong>Group</strong></div>
        <button className="visual-menu-button" aria-label="תפריט" onClick={() => setMenuOpen((open) => !open)}>☰<span>1</span></button>
      </header>
      {menuOpen && <div className="visual-menu"><button>המנות שלי</button><button>החשבון שלי</button><button>התנתקות</button></div>}

      <div className="prototype-scroll visual-scroll">
        <section className={`visual-search-shell ${searchOpen ? "focused" : ""}`}><span>⌕</span><input value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש מנות או מסעדות" /></section>
        <div className="visual-tabs"><button className={tab === "dishes" ? "active" : ""} onClick={() => setTab("dishes")}>מנות</button><button className={tab === "restaurants" ? "active" : ""} onClick={() => setTab("restaurants")}>מסעדות</button></div>
        {tab === "dishes" ? <div className="visual-dish-list">
          {visibleDishes.map((dish) => <article className="visual-dish-card" key={dish.id} onClick={() => setSelected(dish)}>
            <div className="visual-photo">
              <img src={dish.image} alt={dish.title} /><time>{dish.date}</time>
              <div className="visual-dish-heading"><h2>{dish.title}</h2><p>{dish.restaurant}</p></div>
              <div className="visual-side-actions"><button onClick={(event) => event.stopPropagation()} aria-label="צילום תמונה נוספת">▣</button><button className={liked.includes(dish.id) ? "liked" : ""} onClick={(event) => { event.stopPropagation(); setLiked((current) => current.includes(dish.id) ? current.filter((id) => id !== dish.id) : [...current, dish.id]); }} aria-label="הוספה למועדפים">♡</button></div>
              <button className="visual-person" onClick={(event) => event.stopPropagation()} aria-label="פרופיל המשתמש">♙</button>
              {dish.mine && <button className="visual-own-camera" onClick={(event) => event.stopPropagation()} aria-label="צילום מנה">▣</button>}
            </div>
            <div className="visual-card-footer"><div className="visual-ratings"><RatingRow label="טעים" value={dish.tasty} /><RatingRow label="משביע" value={dish.filling} /></div><button className="visual-order" onClick={(event) => event.stopPropagation()}>הזמן <span>🛒</span></button></div>
          </article>)}
          {visibleDishes.length === 0 && <div className="prototype-empty">לא נמצאו מנות מתאימות</div>}
        </div> : <div className="visual-restaurants-placeholder"><span>מסעדות</span><strong>המסעדות של הקבוצה</strong><p>תצוגת המסעדות נשארת כחלק מהמבנה הקיים.</p></div>}
      </div>
      <button className="visual-floating-camera" aria-label="הוספת מנה">▣</button>
    </div></main>

    {selected && <div className="prototype-modal-backdrop" onClick={() => setSelected(null)}><div className="prototype-detail" dir="rtl" onClick={(event) => event.stopPropagation()}><img src={selected.image} alt={selected.title} /><div className="prototype-detail-copy"><span className="eyebrow">פרטי המנה</span><h2>{selected.title}</h2><p>{selected.restaurant}</p><button onClick={() => setSelected(null)}>סגירה</button></div></div></div>}
  </div>;
}
