"use client";

import { useEffect, useState } from "react";

interface ReadLine {
  text: string;
  amountMinor: number;
  itemId?: string;
  productId?: string;
  candidates: { productId: string; label: string }[];
}

interface Reading {
  shopId: string | null;
  date: string;
  lines: ReadLine[];
  shops: { id: string; name: string; address: string }[];
}

interface Outcome {
  status: "accepted" | "pending" | "rejected";
  text: string;
  reason?: string;
}

interface Draft extends ReadLine {
  price: string;
  keep: boolean;
}

const SAMPLE = `SHOP: Sample Mart
DATE: ${new Date().toISOString().slice(0, 10)}
Milk 1L        1.29
Eggs 12        3.10
`;

export default function SubmitApp() {
  const [text, setText] = useState("");
  const [reading, setReading] = useState<Reading | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [shopId, setShopId] = useState("");
  const [date, setDate] = useState("");
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [areaId, setAreaId] = useState<string | undefined>();

  useEffect(() => {
    try {
      setAreaId(JSON.parse(localStorage.getItem("cheapcart.v1") ?? "{}").place?.areaId);
    } catch {
      setAreaId(undefined);
    }
  }, []);

  const load = (r: Reading) => {
    setReading(r);
    setShopId(r.shopId ?? "");
    setDate(r.date);
    setDrafts(r.lines.map((l) => ({ ...l, price: (l.amountMinor / 100).toFixed(2), keep: true })));
    setOutcomes(null);
  };

  const readJson = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/submissions/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, areaId }) });
      const d = await res.json();
      if (!res.ok) setError(d.message ?? "Could not read that.");
      else load(d);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (areaId) form.append("areaId", areaId);
      const res = await fetch("/api/submissions/read", { method: "POST", body: form });
      const d = await res.json();
      if (!res.ok) setError(d.message ?? "Could not read that file.");
      else load(d);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const lines = drafts
        .filter((d) => d.keep)
        .map((d) => ({ text: d.text, amountMinor: Math.round(parseFloat(d.price.replace(",", ".")) * 100), productId: d.productId || undefined }));
      const res = await fetch("/api/submissions/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shopId, date, lines }) });
      const d = await res.json();
      if (!res.ok) setError(d.message ?? "Could not send.");
      else setOutcomes(d.outcomes);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const update = (i: number, patch: Partial<Draft>) => setDrafts((cur) => cur.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <>
      {!reading && (
        <section className="card">
          <label htmlFor="rtext">Receipt text</label>
          <textarea id="rtext" value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} maxLength={20000} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" onClick={readJson} disabled={busy || !text.trim()}>Read it</button>
            <label htmlFor="rfile" className="muted" style={{ margin: 0 }}>or choose a file:</label>
            <input id="rfile" type="file" accept=".txt,text/plain,image/*" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
          </div>
          <p className="muted">Lines with card numbers, names, phone numbers or emails are dropped on reading.</p>
        </section>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      {reading && !outcomes && (
        <section className="card" aria-labelledby="check-h">
          <h2 id="check-h" style={{ marginTop: 0 }}>Check before sending</h2>
          <div className="row">
            <div className="grow">
              <label htmlFor="shop">Shop</label>
              <select id="shop" value={shopId} onChange={(e) => setShopId(e.target.value)}>
                <option value="">Choose a shop</option>
                {reading.shops.map((s) => <option key={s.id} value={s.id}>{s.name}, {s.address}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="date">Date seen</label>
              <input id="date" type="text" value={date} onChange={(e) => setDate(e.target.value)} placeholder="2026-11-02" />
            </div>
          </div>
          {drafts.length === 0 && <p>No priced lines were found.</p>}
          <ul className="plain">
            {drafts.map((d, i) => (
              <li key={i} style={{ flexWrap: "wrap" }}>
                <input type="checkbox" checked={d.keep} onChange={(e) => update(i, { keep: e.target.checked })} aria-label={`Send ${d.text}`} />
                <span className="name">{d.text}</span>
                <select aria-label={`Product for ${d.text}`} value={d.productId ?? ""} onChange={(e) => update(i, { productId: e.target.value || undefined })} style={{ width: "auto" }}>
                  <option value="">Not sure which product</option>
                  {d.candidates.map((c) => <option key={c.productId} value={c.productId}>{c.label}</option>)}
                </select>
                <input type="text" inputMode="decimal" aria-label={`Price for ${d.text}`} value={d.price} onChange={(e) => update(i, { price: e.target.value })} style={{ width: 90 }} />
              </li>
            ))}
          </ul>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={send} disabled={busy || !shopId || !drafts.some((d) => d.keep)}>Send these prices</button>
            <button className="link" onClick={() => setReading(null)}>Start again</button>
          </div>
        </section>
      )}

      {outcomes && (
        <section className="card" aria-live="polite">
          <h2 style={{ marginTop: 0 }}>Thanks</h2>
          <ul className="plain">
            {outcomes.map((o, i) => (
              <li key={i}>
                <span className="name">{o.text}</span>
                <span>{o.status === "accepted" ? "Added" : o.status === "pending" ? `Waiting for a check. ${o.reason ?? ""}` : `Not used. ${o.reason ?? ""}`}</span>
              </li>
            ))}
          </ul>
          <button onClick={() => { setReading(null); setOutcomes(null); setText(""); }}>Send more</button>
        </section>
      )}
    </>
  );
}
