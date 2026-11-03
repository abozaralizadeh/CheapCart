"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseLine } from "../lib/text";
import type { CompareResult, LineResult, Offer } from "../lib/types";

interface AppConfig {
  areas: { id: string; name: string; sample: boolean }[];
  defaultRadiusKm: number;
  minRadiusKm: number;
  maxRadiusKm: number;
  freshnessDays: number;
  currency: string;
  maxListLines: number;
  maxLineLength: number;
}

interface ListItem {
  text: string;
  qty: number;
}

interface Place {
  areaId: string;
  areaName: string;
  lat: number;
  lng: number;
}

const STORE_KEY = "cheapcart.v1";

function readStore(): { items?: ListItem[]; place?: Place | null; radiusKm?: number } {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeStore(data: unknown) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    // Storage can be blocked. The page still works without it.
  }
}

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { message?: string } }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

export default function ListApp() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [radiusKm, setRadiusKm] = useState(3);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<{ id: string; name: string }[]>([]);
  const [postcode, setPostcode] = useState("");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [tab, setTab] = useState<"item" | "shop">("item");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [placeError, setPlaceError] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c: AppConfig) => {
        setCfg(c);
        const saved = readStore();
        setItems(saved.items ?? []);
        setPlace(saved.place ?? null);
        setRadiusKm(saved.radiusKm ?? c.defaultRadiusKm);
        setLoaded(true);
      })
      .catch(() => setError("Could not load the settings. Try again in a moment."));
  }, []);

  useEffect(() => {
    if (loaded) writeStore({ items, place, radiusKm });
  }, [items, place, radiusKm, loaded]);

  const onInput = (v: string) => {
    setInput(v);
    if (timer.current) clearTimeout(timer.current);
    const q = parseLine(v)?.name ?? "";
    if (q.length < 1) return setSuggestions([]);
    timer.current = setTimeout(() => {
      fetch(`/api/items?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setSuggestions(d.suggestions ?? []))
        .catch(() => setSuggestions([]));
    }, 150);
  };

  const addItem = (raw: string) => {
    const p = parseLine(raw);
    if (!p || !cfg) return;
    if (items.length >= cfg.maxListLines) return setError(`A list can have up to ${cfg.maxListLines} items.`);
    setError("");
    setResult(null);
    setItems((cur) => {
      const same = cur.find((i) => i.text.toLowerCase() === p.name.toLowerCase());
      if (same) return cur.map((i) => (i === same ? { ...i, qty: Math.min(99, i.qty + p.quantity) } : i));
      return [...cur, { text: p.name.slice(0, cfg.maxLineLength), qty: p.quantity }];
    });
    setInput("");
    setSuggestions([]);
  };

  const setQty = (idx: number, qty: number) => {
    setResult(null);
    setItems((cur) => (qty < 1 ? cur.filter((_, i) => i !== idx) : cur.map((it, i) => (i === idx ? { ...it, qty: Math.min(99, qty) } : it))));
  };

  const resolveLocation = async (body: unknown) => {
    setPlaceError("");
    try {
      const r = await post<{ area: { id: string; name: string }; point: { lat: number; lng: number } }>("/api/area", body);
      if (!r.ok) return setPlaceError(r.data.message ?? "We could not use that place.");
      setPlace({ areaId: r.data.area.id, areaName: r.data.area.name, lat: r.data.point.lat, lng: r.data.point.lng });
      setResult(null);
    } catch {
      setPlaceError("Something went wrong. Try again.");
    }
  };

  const useDevice = () => {
    if (!navigator.geolocation) return setPlaceError("This device cannot share a location. Use a postcode.");
    navigator.geolocation.getCurrentPosition(
      (pos) => resolveLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setPlaceError("Location was not shared. Use a postcode instead."),
      { maximumAge: 600_000, timeout: 10_000 },
    );
  };

  const runCompare = useCallback(async () => {
    if (!place || items.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const lines = items.map((i) => (i.qty > 1 ? `${i.qty} x ${i.text}` : i.text));
      const r = await post<CompareResult>("/api/compare", { lines, lat: place.lat, lng: place.lng, areaId: place.areaId, radiusKm });
      if (!r.ok) setError(r.data.message ?? "Something went wrong.");
      else {
        setResult(r.data);
        setTicked(new Set());
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }, [place, items, radiusKm]);

  const money = (minor: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: cfg?.currency ?? "EUR" }).format(minor / 100);

  const report = async (o: Offer) => {
    const r = await post("/api/report", { shopId: o.shop.id, productId: o.product.id, note: "Shown price looks wrong" });
    setError(r.ok ? "" : "Could not send the report.");
    if (r.ok) alert("Thanks, we got your report.");
  };

  if (!cfg) return <p aria-live="polite">{error || "Loading..."}</p>;

  return (
    <>
      <section className="card" aria-labelledby="loc-h">
        <h2 id="loc-h" style={{ marginTop: 0 }}>1. Where are you?</h2>
        {place ? (
          <p>
            {place.areaName}. <button className="link" onClick={() => setPlace(null)}>Change</button>
          </p>
        ) : (
          <>
            <div className="row">
              <div className="grow">
                <label htmlFor="pc">Postcode</label>
                <input id="pc" type="text" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="For the sample data try ST1" autoComplete="postal-code" />
              </div>
              <button className="primary" onClick={() => resolveLocation({ postcode })} disabled={!postcode.trim()}>Use postcode</button>
              <button onClick={useDevice}>Use my location</button>
            </div>
            <p className="muted">Your location stays on this device. It is sent only to work out the answer and is not saved.</p>
          </>
        )}
        {placeError && <p className="error" role="alert">{placeError}</p>}
        <div style={{ marginTop: 8 }}>
          <label htmlFor="radius">How far will you go: {radiusKm} km</label>
          <input id="radius" type="range" min={cfg.minRadiusKm} max={cfg.maxRadiusKm} step={1} value={radiusKm} onChange={(e) => { setRadiusKm(Number(e.target.value)); setResult(null); }} />
        </div>
      </section>

      <section className="card" aria-labelledby="list-h">
        <h2 id="list-h" style={{ marginTop: 0 }}>2. Your list</h2>
        <form onSubmit={(e) => { e.preventDefault(); addItem(input); }}>
          <label htmlFor="item">Add an item</label>
          <div className="row">
            <div className="grow"><input id="item" type="search" value={input} onChange={(e) => onInput(e.target.value)} placeholder="milk, 2 eggs, bread..." maxLength={cfg.maxLineLength} autoComplete="off" /></div>
            <button type="submit" className="primary" disabled={!input.trim()}>Add</button>
          </div>
        </form>
        {suggestions.length > 0 && (
          <div className="suggest" aria-label="Suggestions">
            {suggestions.map((s) => (
              <button key={s.id} type="button" onClick={() => addItem(`${parseLine(input)?.quantity ?? 1} ${s.name}`)}>{s.name}</button>
            ))}
          </div>
        )}
        {items.length === 0 ? (
          <p className="muted">Nothing here yet.</p>
        ) : (
          <ul className="plain">
            {items.map((it, i) => (
              <li key={it.text}>
                <span className="name">{it.text}</span>
                <button aria-label={`Less ${it.text}`} onClick={() => setQty(i, it.qty - 1)}>-</button>
                <span aria-label={`Quantity ${it.qty}`}>{it.qty}</span>
                <button aria-label={`More ${it.text}`} onClick={() => setQty(i, it.qty + 1)}>+</button>
              </li>
            ))}
          </ul>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={runCompare} disabled={busy || !place || items.length === 0}>
            {busy ? "Working..." : "Find the cheapest shops"}
          </button>
          {items.length > 0 && <button className="link" onClick={() => { setItems([]); setResult(null); }}>Clear list</button>}
        </div>
        {!place && items.length > 0 && <p className="muted">Set where you are first.</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <div aria-live="polite">{result && <Results r={result} cfg={cfg} tab={tab} setTab={setTab} money={money} ticked={ticked} setTicked={setTicked} report={report} />}</div>
    </>
  );
}

function Results({ r, cfg, tab, setTab, money, ticked, setTicked, report }: {
  r: CompareResult;
  cfg: AppConfig;
  tab: "item" | "shop";
  setTab: (t: "item" | "shop") => void;
  money: (m: number) => string;
  ticked: Set<string>;
  setTicked: (s: Set<string>) => void;
  report: (o: Offer) => void;
}) {
  const s = r.summary;
  const age = (d: number) => (d === 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`);
  return (
    <>
      <section className="card summary" aria-labelledby="sum-h">
        <h2 id="sum-h" style={{ marginTop: 0 }}>Your answer</h2>
        {s.sample && <p><span className="tag sample">sample</span> These prices are made up. The saving below is not real.</p>}
        <div className="big">{money(s.totalMinor)}</div>
        <p className="muted">for {s.pricedCount} priced item{s.pricedCount === 1 ? "" : "s"}, buying each where it is cheapest, in {s.shopsNeeded} shop{s.shopsNeeded === 1 ? "" : "s"}.</p>
        {s.unpricedCount > 0 && <p>{s.unpricedCount} item{s.unpricedCount === 1 ? "" : "s"} could not be priced. They are left out of the total.</p>}
        {s.bestSingleShop && (
          <p>
            Best single shop: <strong>{s.bestSingleShop.shop.name}</strong>, {s.bestSingleShop.distanceKm.toFixed(1)} km away. It sells {s.bestSingleShop.coveredCount} of your {s.pricedCount} priced items.
            {s.savingMinor > 0 ? (
              <> On the {s.comparedCount} item{s.comparedCount === 1 ? "" : "s"} it sells, buying each where it is cheapest saves <strong>{money(s.savingMinor)} ({s.savingPct}%)</strong> but needs {s.shopsNeeded} shop{s.shopsNeeded === 1 ? "" : "s"}. Is that worth the extra stops?</>
            ) : (
              <> On the {s.comparedCount} item{s.comparedCount === 1 ? "" : "s"} it sells, going elsewhere saves nothing. Just go there.</>
            )}
          </p>
        )}
        <p className="muted">Within {r.meta.radiusKm} km ({r.meta.shopsInRange} shop{r.meta.shopsInRange === 1 ? "" : "s"}). Prices older than {cfg.freshnessDays} days are not used.</p>
      </section>

      <div className="tabs" role="group" aria-label="View">
        <button aria-pressed={tab === "item"} onClick={() => setTab("item")}>By item</button>
        <button aria-pressed={tab === "shop"} onClick={() => setTab("shop")}>By shop</button>
      </div>

      {tab === "item" ? (
        r.lines.map((l, i) => <LineCard key={i} l={l} money={money} age={age} cfg={cfg} radius={r.meta.radiusKm} report={report} />)
      ) : r.shops.length === 0 ? (
        <p>No shop to show, nothing was priced.</p>
      ) : (
        r.shops.map((g) => (
          <section className="card" key={g.shop.id} aria-labelledby={`sh-${g.shop.id}`}>
            <div className="line">
              <h2 id={`sh-${g.shop.id}`} style={{ margin: 0 }}>{g.shop.name}</h2>
              <span className="price">{money(g.subtotalMinor)}</span>
            </div>
            <p className="muted">
              {g.shop.address}, {g.distanceKm.toFixed(1)} km away.{" "}
              <a href={`https://www.openstreetmap.org/?mlat=${g.shop.lat}&mlon=${g.shop.lng}#map=17/${g.shop.lat}/${g.shop.lng}`} target="_blank" rel="noopener noreferrer">Open on a map</a>
            </p>
            <ul className="plain">
              {g.lines.map((x) => {
                const key = `${g.shop.id}|${x.raw}`;
                return (
                  <li key={key}>
                    <input type="checkbox" id={key} checked={ticked.has(key)} onChange={(e) => { const n = new Set(ticked); if (e.target.checked) n.add(key); else n.delete(key); setTicked(n); }} />
                    <label htmlFor={key} className="name" style={{ fontWeight: 400, margin: 0, textDecoration: ticked.has(key) ? "line-through" : "none" }}>
                      {x.quantity > 1 ? `${x.quantity} x ` : ""}{x.itemName} <span className="muted">({x.offer.product.brand} {x.offer.product.packSize})</span>
                    </label>
                    <span>{money(x.lineTotalMinor)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

function LineCard({ l, money, age, cfg, radius, report }: {
  l: LineResult;
  money: (m: number) => string;
  age: (d: number) => string;
  cfg: AppConfig;
  radius: number;
  report: (o: Offer) => void;
}) {
  const qty = l.quantity > 1 ? `${l.quantity} x ` : "";
  if (l.status === "not_found") {
    return <div className="card"><strong>{l.raw}</strong><p className="error">We could not match this to an item. It is left out of the total.</p></div>;
  }
  if (l.status === "no_price_nearby" || !l.best) {
    return <div className="card"><strong>{qty}{l.item?.name}</strong><p className="error">No price within {radius} km in the last {cfg.freshnessDays} days. It is left out of the total.</p></div>;
  }
  const b = l.best;
  const unit = l.item!.unit === "each" ? "each" : `per ${l.item!.unit}`;
  return (
    <div className="card">
      <div className="line">
        <strong>{qty}{l.item!.name}</strong>
        <span className="price">{money(b.lineTotalMinor)}</span>
      </div>
      <div>
        {b.shop.name}, {b.distanceKm.toFixed(1)} km
        {b.isPromo && <span className="tag promo">offer</span>}
        {b.source === "sample" && <span className="tag sample">sample</span>}
      </div>
      <div className="muted">
        {b.product.brand}, {l.item!.unit === "each" ? `pack of ${b.product.packSize}` : `${b.product.packSize} ${l.item!.unit}`}: {money(b.amountMinor)} a pack ({money(Math.round(b.unitPriceMinor))} {unit}). Price seen {age(b.ageDays)}.
      </div>
      {l.alternatives.length > 0 && (
        <details>
          <summary>Other shops</summary>
          <ul className="plain">
            {l.alternatives.map((o) => (
              <li key={o.shop.id}>
                <span className="name">{o.shop.name}, {o.distanceKm.toFixed(1)} km <span className="muted">(seen {age(o.ageDays)})</span></span>
                <span>{money(o.amountMinor * l.quantity)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <button className="link" onClick={() => report(b)}>Price looks wrong?</button>
    </div>
  );
}
