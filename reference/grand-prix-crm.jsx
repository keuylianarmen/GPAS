import React, { useState, useMemo } from "react";

/* ── tokens ─────────────────────────────────────────────── */
const T = {
  ink: "#1A1C1D",
  surface: "#F2F1ED",
  card: "#FFFFFF",
  crimson: "#A32D2D",
  steel: "#6E7071",
  hair: "#E2E0DA",
  amber: "#8A5A06",
  amberBg: "#FAF3E4",
  green: "#2F6B4F",
  greenBg: "#EAF2EC",
};
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

/* ── seed data ──────────────────────────────────────────── */
const CATEGORIES = [
  { id: 1, code: "oil", name: "Oil & Filters" },
  { id: 2, code: "tires", name: "Tires" },
  { id: 3, code: "brakes", name: "Brakes" },
  { id: 4, code: "diagnostics", name: "Diagnostics" },
  { id: 5, code: "electrical", name: "Electrical" },
  { id: 6, code: "transmission", name: "Gearbox" },
  { id: 7, code: "steering_suspension", name: "Steering & Suspension" },
  { id: 9, code: "cooling", name: "Cooling System" },
  { id: 10, code: "ac_hvac", name: "AC / HVAC" },
  { id: 11, code: "battery_charging", name: "Battery & Charging" },
  { id: 16, code: "winch", name: "Winch / Recovery" },
  { id: 17, code: "other", name: "Other" },
];

const SEED_SERVICES = [
  ["Oil change", 1, 18, "oil", 5000, 6],
  ["Oil filter replacement", 1, 6.5, null, null, null],
  ["Air filter replacement", 1, 8, "air_filter", 15000, 12],
  ["Tire rotation", 2, 8, "rotation", 10000, 6],
  ["Balancing — all four", 2, 12, "balancing", 10000, 12],
  ["Alignment — full", 2, 20, "alignment", 20000, 12],
  ["Puncture repair", 2, 5, null, null, null],
  ["New tires installed", 2, 0, "tire_life", 60000, 60],
  ["Brake pads — front", 3, 35, "brakes", 40000, 24],
  ["Brake pads — rear", 3, 35, null, null, null],
  ["Brake fluid flush", 3, 22, "brake_fluid", 40000, 24],
  ["Full system scan", 4, 15, null, null, null],
  ["Read fault codes", 4, 8, null, null, null],
  ["Spark plug replacement", 5, 40, "spark_plugs", 40000, 36],
  ["Transmission fluid change", 6, 45, "transmission", 60000, 48],
  ["Front shock replacement", 7, 55, null, null, null],
  ["Coolant flush", 9, 25, "coolant", 60000, 48],
  ["AC recharge", 10, 30, "ac", null, 24],
  ["Cabin filter replacement", 10, 10, "cabin_filter", 15000, 12],
  ["Battery test & report", 11, 0, null, null, null],
  ["Battery replacement", 11, 45, "battery", null, 36],
  ["Tow to shop — in city", 16, 15, null, null, null],
].map(([name, cat, price, rtype, rkm, rmo], i) => ({
  id: "s" + i, name, cat, price, rtype, rkm, rmo,
}));

const SEED_CUSTOMERS = [
  { id: "c1", name: "Ahmad Shawabkeh", phone: "079 812 4430", optIn: true, since: "2023-04-11",
    vehicles: [{ id: "v1", plate: "21-45678", make: "Toyota", model: "Corolla", year: 2019, odo: 84210 }] },
  { id: "c2", name: "Rania Haddad", phone: "078 220 9917", optIn: true, since: "2024-01-22",
    vehicles: [{ id: "v2", plate: "9-33241", make: "Hyundai", model: "Tucson", year: 2021, odo: 41880 }] },
  { id: "c3", name: "Khaled Amoush", phone: "077 445 1180", optIn: false, since: "2022-09-03",
    vehicles: [
      { id: "v3", plate: "44-12093", make: "Kia", model: "Sportage", year: 2017, odo: 152600 },
      { id: "v4", plate: "44-90112", make: "Toyota", model: "Hilux", year: 2015, odo: 219400 },
    ] },
  { id: "c4", name: "Samer Nassar", phone: "", optIn: false, since: "2026-08-02", vehicles: [] },
];

const SEED_JOBS = [
  { id: "j1", cust: "c1", veh: "v1", date: "2026-08-23", total: 24.5, pay: "Cash",
    lines: [{ name: "Oil change", price: 18 }, { name: "Oil filter replacement", price: 6.5 }] },
  { id: "j2", cust: "c2", veh: "v2", date: "2026-08-23", total: 32, pay: "CliQ",
    lines: [{ name: "Balancing — all four", price: 12 }, { name: "Alignment — full", price: 20 }] },
  { id: "j3", cust: "c3", veh: "v3", date: "2026-08-21", total: 70, pay: "Cash",
    lines: [{ name: "Brake pads — front", price: 35 }, { name: "Brake pads — rear", price: 35 }] },
  { id: "j4", cust: "c1", veh: "v1", date: "2026-08-14", total: 45, pay: "Card",
    lines: [{ name: "Battery replacement", price: 45 }] },
];

const SEED_REMINDERS = [
  { id: "r1", cust: "c2", veh: "v2", service: "Oil change", due: "2026-08-26", dueKm: 46880, status: "pending" },
  { id: "r2", cust: "c1", veh: "v1", service: "Tire rotation", due: "2026-08-30", dueKm: 89210, status: "pending" },
  { id: "r3", cust: "c3", veh: "v3", service: "Alignment — full", due: "2026-09-08", dueKm: 172600, status: "pending" },
  { id: "r4", cust: "c1", veh: "v1", service: "Cabin filter replacement", due: "2026-09-20", dueKm: null, status: "pending" },
  { id: "r5", cust: "c2", veh: "v2", service: "AC recharge", due: "2026-08-19", dueKm: null, status: "sent" },
];

const PAY = ["Cash", "Card", "CliQ", "Bank transfer", "On account"];
const money = (n) => (Number(n) || 0).toFixed(3);
const today = "2026-08-23";

/* ── primitives ─────────────────────────────────────────── */
const Card = ({ children, pad = 18, style }) => (
  <div style={{ background: T.card, border: `1px solid ${T.hair}`, borderRadius: 10, padding: pad, ...style }}>
    {children}
  </div>
);

const Btn = ({ children, onClick, kind = "ghost", disabled, full, small }) => {
  const base = {
    borderRadius: 8, cursor: disabled ? "default" : "pointer", fontFamily: SANS,
    fontSize: small ? 13 : 14, fontWeight: 500, padding: small ? "8px 12px" : "11px 18px",
    minHeight: small ? 34 : 42, width: full ? "100%" : undefined, opacity: disabled ? 0.45 : 1,
  };
  const kinds = {
    primary: { background: T.crimson, color: "#fff", border: "none" },
    dark: { background: T.ink, color: "#fff", border: "none" },
    ghost: { background: "transparent", color: T.ink, border: `1px solid ${T.hair}` },
    quiet: { background: "transparent", color: T.steel, border: "none" },
  };
  return <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ ...base, ...kinds[kind] }}>{children}</button>;
};

const Field = ({ label, hint, children }) => (
  <label style={{ display: "block", marginBottom: 14 }}>
    <span style={{ display: "block", fontSize: 13, color: T.steel, marginBottom: 6, fontWeight: 500 }}>
      {label}{hint && <span style={{ color: T.hair, fontWeight: 400 }}> · {hint}</span>}
    </span>
    {children}
  </label>
);

const inputStyle = {
  width: "100%", boxSizing: "border-box", fontSize: 15, padding: "11px 13px",
  border: `1px solid ${T.hair}`, borderRadius: 8, background: T.card, color: T.ink,
  outline: "none", fontFamily: SANS,
};

const Input = (p) => <input {...p} style={{ ...inputStyle, ...(p.mono ? { fontFamily: MONO } : {}), ...p.style }} />;

const Select = ({ value, onChange, options, placeholder }) => (
  <select value={value} onChange={onChange} style={{ ...inputStyle, cursor: "pointer" }}>
    <option value="">{placeholder || "—"}</option>
    {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
  </select>
);

const Pill = ({ children, tone = "steel" }) => {
  const tones = {
    steel: { bg: T.surface, fg: T.steel }, amber: { bg: T.amberBg, fg: T.amber },
    green: { bg: T.greenBg, fg: T.green }, crimson: { bg: "#F8EDED", fg: T.crimson },
  };
  const c = tones[tone];
  return <span style={{ background: c.bg, color: c.fg, fontSize: 12, fontWeight: 500, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>{children}</span>;
};

const Modal = ({ title, onClose, children, wide }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,28,29,.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, borderRadius: 12, width: "100%", maxWidth: wide ? 620 : 440, maxHeight: "86vh", overflowY: "auto" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.hair}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, color: T.steel, cursor: "pointer", lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  </div>
);

const Empty = ({ children }) => (
  <div style={{ border: `1px dashed ${T.hair}`, borderRadius: 10, padding: 32, textAlign: "center", fontSize: 14, color: T.steel }}>{children}</div>
);

const SectionLabel = ({ children, right }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: T.steel }}>{children}</span>
    {right}
  </div>
);

/* ── app ────────────────────────────────────────────────── */
export default function CRM() {
  const [tab, setTab] = useState("dash");
  const [services, setServices] = useState(SEED_SERVICES);
  const [customers, setCustomers] = useState(SEED_CUSTOMERS);
  const [jobs, setJobs] = useState(SEED_JOBS);
  const [reminders, setReminders] = useState(SEED_REMINDERS);

  const custById = (id) => customers.find((c) => c.id === id);
  const vehById = (id) => customers.flatMap((c) => c.vehicles).find((v) => v.id === id);

  const nav = [
    ["dash", "Dashboard"], ["new", "New job"], ["cust", "Customers"],
    ["rem", "Reminders"], ["svc", "Services"],
  ];

  return (
    <div style={{ fontFamily: SANS, background: T.surface, color: T.ink, minHeight: "100vh" }}>
      <div style={{ background: T.ink, color: "#fff" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", border: "3px solid #fff", borderBottomColor: T.crimson, transform: "rotate(-20deg)" }} />
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: ".05em" }}>GRAND PRIX</span>
          </div>
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {nav.map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                background: "transparent", border: "none", borderBottom: `2px solid ${tab === k ? T.crimson : "transparent"}`,
                color: tab === k ? "#fff" : "rgba(255,255,255,.6)", padding: "16px 14px", fontSize: 14,
                fontWeight: tab === k ? 600 : 400, cursor: "pointer", fontFamily: SANS,
              }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 20px 60px" }}>
        {tab === "dash" && <Dashboard {...{ jobs, customers, reminders, custById, vehById, setTab }} />}
        {tab === "new" && <NewJob {...{ customers, setCustomers, services, setServices, jobs, setJobs, setTab }} />}
        {tab === "cust" && <Customers {...{ customers, setCustomers, jobs, reminders }} />}
        {tab === "rem" && <Reminders {...{ reminders, setReminders, custById, vehById }} />}
        {tab === "svc" && <Services {...{ services, setServices }} />}
      </div>
    </div>
  );
}

/* ── dashboard ──────────────────────────────────────────── */
function Dashboard({ jobs, customers, reminders, custById, vehById, setTab }) {
  const todayJobs = jobs.filter((j) => j.date === today);
  const monthRev = jobs.filter((j) => j.date.startsWith("2026-08")).reduce((s, j) => s + j.total, 0);
  const due = reminders.filter((r) => r.status === "pending" && r.due <= "2026-09-06");
  const noPhone = customers.filter((c) => !c.phone).length;

  const stats = [
    ["Jobs today", todayJobs.length, null],
    ["Revenue this month", money(monthRev), "JOD"],
    ["Reminders due", due.length, null],
    ["Customers", customers.length, null],
  ];

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 26 }}>
        {stats.map(([label, val, unit]) => (
          <Card key={label}>
            <div style={{ fontSize: 12, color: T.steel, fontWeight: 500, marginBottom: 8 }}>{label}</div>
            <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 600, letterSpacing: "-.01em" }}>
              {val}{unit && <span style={{ fontSize: 14, color: T.steel, fontWeight: 400, marginLeft: 6 }}>{unit}</span>}
            </div>
          </Card>
        ))}
      </div>

      {noPhone > 0 && (
        <Card style={{ marginBottom: 26, borderInlineStart: `3px solid ${T.amber}` }}>
          <div style={{ fontSize: 14 }}>
            <strong style={{ fontWeight: 600 }}>{noPhone} customer{noPhone > 1 ? "s" : ""} without a phone number.</strong>{" "}
            <span style={{ color: T.steel }}>They can't receive reminders until one is added.</span>
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        <div>
          <SectionLabel right={<Btn kind="quiet" small onClick={() => setTab("new")}>Add job</Btn>}>Recent jobs</SectionLabel>
          {jobs.slice(0, 5).map((j) => {
            const c = custById(j.cust), v = vehById(j.veh);
            return (
              <Card key={j.id} pad={14} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{c?.name}</div>
                    <div style={{ fontSize: 13, color: T.steel, marginTop: 3 }}>
                      {v ? `${v.make} ${v.model} · ${v.plate}` : "No vehicle recorded"}
                    </div>
                    <div style={{ fontSize: 13, color: T.steel, marginTop: 6 }}>
                      {j.lines.map((l) => l.name).join(" · ")}
                    </div>
                  </div>
                  <div style={{ textAlign: "end", whiteSpace: "nowrap" }}>
                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600 }}>{money(j.total)}</div>
                    <div style={{ fontSize: 12, color: T.steel, marginTop: 4 }}>{j.pay}</div>
                    <div style={{ fontSize: 12, color: T.steel, marginTop: 2 }}>{j.date === today ? "Today" : j.date.slice(5)}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div>
          <SectionLabel right={<Btn kind="quiet" small onClick={() => setTab("rem")}>See all</Btn>}>Going out soon</SectionLabel>
          {due.length === 0 ? <Empty>Nothing due in the next two weeks.</Empty> : due.map((r) => {
            const c = custById(r.cust), v = vehById(r.veh);
            return (
              <Card key={r.id} pad={14} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{c?.name}</div>
                    <div style={{ fontSize: 13, color: T.steel, marginTop: 3 }}>{r.service} · {v?.plate}</div>
                  </div>
                  <div style={{ textAlign: "end" }}>
                    <div style={{ fontFamily: MONO, fontSize: 13 }}>{r.due.slice(5)}</div>
                    {!c?.optIn && <div style={{ marginTop: 6 }}><Pill tone="amber">No opt-in</Pill></div>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ── new job (stepped) ──────────────────────────────────── */
function NewJob({ customers, setCustomers, services, setServices, jobs, setJobs, setTab }) {
  const [step, setStep] = useState(1);
  const [cust, setCust] = useState(null);
  const [veh, setVeh] = useState(null);
  const [lines, setLines] = useState([]);
  const [pay, setPay] = useState("");
  const [odo, setOdo] = useState("");
  const [saved, setSaved] = useState(false);

  const [q, setQ] = useState("");
  const [newCust, setNewCust] = useState(null);
  const [newVeh, setNewVeh] = useState(null);
  const [svcModal, setSvcModal] = useState(false);
  const [svcQ, setSvcQ] = useState("");

  const total = lines.reduce((s, l) => s + (Number(l.price) || 0), 0);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return customers.filter((c) => c.name.toLowerCase().includes(t) || c.phone.replace(/\s/g, "").includes(t.replace(/\s/g, ""))).slice(0, 6);
  }, [q, customers]);

  const svcResults = useMemo(() => {
    const t = svcQ.trim().toLowerCase();
    const pool = services.filter((s) => !lines.some((l) => l.id === s.id));
    return t ? pool.filter((s) => s.name.toLowerCase().includes(t)) : pool;
  }, [svcQ, services, lines]);

  const saveCustomer = () => {
    const c = { id: "c" + Date.now(), name: newCust.name || "", phone: newCust.phone || "", optIn: !!newCust.optIn, since: today, vehicles: [] };
    setCustomers((p) => [c, ...p]); setCust(c); setNewCust(null);
  };

  const saveVehicle = () => {
    const v = { id: "v" + Date.now(), plate: newVeh.plate || "", make: newVeh.make || "", model: newVeh.model || "", year: newVeh.year || "", odo: Number(newVeh.odo) || null };
    setCustomers((p) => p.map((c) => c.id === cust.id ? { ...c, vehicles: [...c.vehicles, v] } : c));
    setCust((c) => ({ ...c, vehicles: [...c.vehicles, v] })); setVeh(v); setNewVeh(null);
  };

  const save = () => {
    setJobs((p) => [{
      id: "j" + Date.now(), cust: cust.id, veh: veh?.id || null, date: today,
      total, pay: pay || "—", lines: lines.map((l) => ({ name: l.name, price: Number(l.price) || 0 })),
    }, ...p]);
    setSaved(true);
  };

  if (saved) return (
    <Card style={{ maxWidth: 520, margin: "40px auto", textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Job saved</div>
      <div style={{ fontFamily: MONO, fontSize: 32, fontWeight: 600, marginBottom: 6 }}>{money(total)}</div>
      <div style={{ fontSize: 14, color: T.steel, marginBottom: 24 }}>{cust.name}{veh ? ` · ${veh.plate}` : ""}</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <Btn kind="dark" onClick={() => { setSaved(false); setStep(1); setCust(null); setVeh(null); setLines([]); setPay(""); setOdo(""); setQ(""); }}>Add another</Btn>
        <Btn onClick={() => setTab("dash")}>Back to dashboard</Btn>
      </div>
    </Card>
  );

  const steps = ["Customer", "Vehicle", "Services", "Payment"];

  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
        {steps.map((s, i) => (
          <div key={s} style={{ flex: 1 }}>
            <div style={{ height: 3, borderRadius: 2, background: i + 1 <= step ? T.crimson : T.hair, marginBottom: 7 }} />
            <div style={{ fontSize: 12, color: i + 1 === step ? T.ink : T.steel, fontWeight: i + 1 === step ? 600 : 400 }}>{s}</div>
          </div>
        ))}
      </div>

      {/* step 1 — customer */}
      {step === 1 && (
        <Card>
          <SectionLabel>Who is this for?</SectionLabel>
          {cust ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{cust.name || "Unnamed"}</div>
                <div style={{ fontSize: 13, color: T.steel, marginTop: 3 }}>{cust.phone || "No phone"}</div>
              </div>
              <Btn small onClick={() => { setCust(null); setVeh(null); }}>Change</Btn>
            </div>
          ) : newCust ? (
            <>
              <Field label="Name"><Input value={newCust.name || ""} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} placeholder="Ahmad Shawabkeh" /></Field>
              <Field label="Phone" hint="needed for reminders">
                <Input mono value={newCust.phone || ""} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} placeholder="079 000 0000" />
              </Field>
              <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, marginBottom: 18, cursor: "pointer" }}>
                <input type="checkbox" checked={!!newCust.optIn} onChange={(e) => setNewCust({ ...newCust, optIn: e.target.checked })} style={{ width: 17, height: 17 }} />
                Happy to receive WhatsApp reminders
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn kind="dark" onClick={saveCustomer}>Save customer</Btn>
                <Btn onClick={() => setNewCust(null)}>Cancel</Btn>
              </div>
            </>
          ) : (
            <>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone" />
              <div style={{ marginTop: 10 }}>
                {matches.map((c) => (
                  <button key={c.id} onClick={() => { setCust(c); setQ(""); }} style={{
                    width: "100%", textAlign: "start", background: "transparent", border: "none",
                    borderBottom: `1px solid ${T.hair}`, padding: "12px 2px", cursor: "pointer", fontFamily: SANS,
                  }}>
                    <div style={{ fontSize: 15 }}>{c.name}</div>
                    <div style={{ fontSize: 13, color: T.steel, marginTop: 2 }}>
                      {c.phone || "No phone"}{c.vehicles.length ? ` · ${c.vehicles.length} vehicle${c.vehicles.length > 1 ? "s" : ""}` : ""}
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>
                <Btn kind="ghost" full onClick={() => setNewCust({ name: q })}>+ New customer</Btn>
              </div>
            </>
          )}
          <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
            <Btn kind="dark" disabled={!cust} onClick={() => setStep(2)}>Next</Btn>
          </div>
        </Card>
      )}

      {/* step 2 — vehicle */}
      {step === 2 && (
        <Card>
          <SectionLabel>Which vehicle?</SectionLabel>
          {newVeh ? (
            <>
              <Field label="Plate"><Input mono value={newVeh.plate || ""} onChange={(e) => setNewVeh({ ...newVeh, plate: e.target.value })} placeholder="21-45678" /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Make"><Input value={newVeh.make || ""} onChange={(e) => setNewVeh({ ...newVeh, make: e.target.value })} placeholder="Toyota" /></Field>
                <Field label="Model"><Input value={newVeh.model || ""} onChange={(e) => setNewVeh({ ...newVeh, model: e.target.value })} placeholder="Corolla" /></Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Year"><Input mono value={newVeh.year || ""} onChange={(e) => setNewVeh({ ...newVeh, year: e.target.value })} placeholder="2019" /></Field>
                <Field label="Odometer"><Input mono value={newVeh.odo || ""} onChange={(e) => setNewVeh({ ...newVeh, odo: e.target.value })} placeholder="84210" /></Field>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn kind="dark" onClick={saveVehicle}>Save vehicle</Btn>
                <Btn onClick={() => setNewVeh(null)}>Cancel</Btn>
              </div>
            </>
          ) : (
            <>
              {cust.vehicles.length === 0 && <Empty>No vehicle on file for {cust.name}.</Empty>}
              {cust.vehicles.map((v) => (
                <button key={v.id} onClick={() => { setVeh(v); setOdo(v.odo || ""); }} style={{
                  width: "100%", textAlign: "start", background: veh?.id === v.id ? T.surface : "transparent",
                  border: `1px solid ${veh?.id === v.id ? T.ink : T.hair}`, borderRadius: 8,
                  padding: "12px 14px", marginBottom: 8, cursor: "pointer", fontFamily: SANS,
                }}>
                  <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600 }}>{v.plate || "No plate"}</div>
                  <div style={{ fontSize: 13, color: T.steel, marginTop: 3 }}>{v.make} {v.model} {v.year && `· ${v.year}`}</div>
                </button>
              ))}
              <div style={{ marginTop: 12 }}><Btn full onClick={() => setNewVeh({})}>+ Add vehicle</Btn></div>
              {veh && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.hair}` }}>
                  <Field label="Odometer today" hint="drives reminders">
                    <Input mono value={odo} onChange={(e) => setOdo(e.target.value)} placeholder="84210" />
                  </Field>
                </div>
              )}
            </>
          )}
          <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between" }}>
            <Btn kind="quiet" onClick={() => setStep(1)}>Back</Btn>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => setStep(3)}>Skip</Btn>
              <Btn kind="dark" onClick={() => setStep(3)}>Next</Btn>
            </div>
          </div>
        </Card>
      )}

      {/* step 3 — services */}
      {step === 3 && (
        <Card>
          <SectionLabel right={<Btn kind="quiet" small onClick={() => setSvcModal(true)}>+ Add line</Btn>}>What was done?</SectionLabel>
          {lines.length === 0 ? <Empty>Nothing on this job yet.</Empty> : lines.map((l, idx) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: `1px solid ${T.hair}` }}>
              <div style={{ flex: 1, fontSize: 15 }}>{l.name}</div>
              <Input mono value={l.price} onChange={(e) => setLines((p) => p.map((x, i) => i === idx ? { ...x, price: e.target.value } : x))} style={{ width: 92, textAlign: "end", padding: "8px 10px" }} />
              <button onClick={() => setLines((p) => p.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: T.steel, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>×</button>
            </div>
          ))}
          {lines.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 14, fontSize: 15 }}>
              <span style={{ color: T.steel }}>Total</span>
              <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600 }}>{money(total)}</span>
            </div>
          )}
          <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between" }}>
            <Btn kind="quiet" onClick={() => setStep(2)}>Back</Btn>
            <Btn kind="dark" onClick={() => setStep(4)}>Next</Btn>
          </div>
        </Card>
      )}

      {/* step 4 — payment */}
      {step === 4 && (
        <Card>
          <SectionLabel>How was it paid?</SectionLabel>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            {PAY.map((p) => (
              <button key={p} onClick={() => setPay(p)} style={{
                background: pay === p ? T.ink : "transparent", color: pay === p ? "#fff" : T.ink,
                border: `1px solid ${pay === p ? T.ink : T.hair}`, borderRadius: 8, padding: "10px 16px",
                fontSize: 14, cursor: "pointer", fontFamily: SANS,
              }}>{p}</button>
            ))}
          </div>
          <div style={{ background: T.surface, borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 14, marginBottom: 4 }}>{cust.name || "Unnamed customer"}</div>
            <div style={{ fontSize: 13, color: T.steel, marginBottom: 12 }}>{veh ? `${veh.make} ${veh.model} · ${veh.plate}` : "No vehicle recorded"}</div>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0" }}>
                <span style={{ color: T.steel }}>{l.name}</span>
                <span style={{ fontFamily: MONO }}>{money(l.price)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${T.hair}`, marginTop: 10, paddingTop: 10 }}>
              <span style={{ fontWeight: 500 }}>Total</span>
              <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600 }}>{money(total)}</span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Btn kind="quiet" onClick={() => setStep(3)}>Back</Btn>
            <Btn kind="primary" onClick={save}>Save job</Btn>
          </div>
        </Card>
      )}

      {svcModal && (
        <ServicePicker
          services={svcResults} q={svcQ} setQ={setSvcQ}
          onPick={(s) => { setLines((p) => [...p, { id: s.id, name: s.name, price: s.price }]); setSvcModal(false); setSvcQ(""); }}
          onCreate={(name, cat, price) => {
            const s = { id: "s" + Date.now(), name, cat, price: Number(price) || 0, rtype: null, rkm: null, rmo: null };
            setServices((p) => [...p, s]);
            setLines((p) => [...p, { id: s.id, name: s.name, price: s.price }]);
            setSvcModal(false); setSvcQ("");
          }}
          onClose={() => { setSvcModal(false); setSvcQ(""); }}
        />
      )}
    </div>
  );
}

function ServicePicker({ services, q, setQ, onPick, onCreate, onClose }) {
  const [creating, setCreating] = useState(false);
  const [cat, setCat] = useState("");
  const [price, setPrice] = useState("");

  return (
    <Modal title={creating ? "New service" : "Add a line"} onClose={onClose}>
      {creating ? (
        <>
          <Field label="Service name"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Radiator flush" /></Field>
          <Field label="Category">
            <Select value={cat} onChange={(e) => setCat(e.target.value)} options={CATEGORIES.map((c) => ({ v: c.id, l: c.name }))} placeholder="Pick one" />
          </Field>
          <Field label="Usual price" hint="optional"><Input mono value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.000" /></Field>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn kind="dark" disabled={!q.trim()} onClick={() => onCreate(q.trim(), Number(cat) || 17, price)}>Save and add</Btn>
            <Btn onClick={() => setCreating(false)}>Back</Btn>
          </div>
        </>
      ) : (
        <>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services" autoFocus />
          <div style={{ maxHeight: 320, overflowY: "auto", margin: "12px 0" }}>
            {services.map((s) => (
              <button key={s.id} onClick={() => onPick(s)} style={{
                width: "100%", textAlign: "start", background: "transparent", border: "none",
                borderBottom: `1px solid ${T.hair}`, padding: "11px 2px", cursor: "pointer", fontFamily: SANS,
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
              }}>
                <span>
                  <span style={{ fontSize: 15, display: "block" }}>{s.name}</span>
                  <span style={{ fontSize: 12, color: T.steel }}>{CATEGORIES.find((c) => c.id === s.cat)?.name}</span>
                </span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: T.steel }}>{s.price ? money(s.price) : ""}</span>
              </button>
            ))}
            {services.length === 0 && <Empty>No service matches "{q}".</Empty>}
          </div>
          <Btn full onClick={() => setCreating(true)}>+ Create "{q.trim() || "new service"}"</Btn>
        </>
      )}
    </Modal>
  );
}

/* ── customers ──────────────────────────────────────────── */
function Customers({ customers, setCustomers, jobs, reminders }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(null);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? customers.filter((c) => c.name.toLowerCase().includes(t) || c.phone.includes(t)) : customers;
  }, [q, customers]);

  const sel = customers.find((c) => c.id === open);

  return (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers" />
        </div>
        <Btn kind="dark" onClick={() => setAdding({ vehicles: [{}] })}>+ New customer</Btn>
      </div>

      {list.length === 0 ? <Empty>No customer matches "{q}".</Empty> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          {list.map((c) => {
            const count = jobs.filter((j) => j.cust === c.id).length;
            return (
              <Card key={c.id} pad={16} style={{ cursor: "pointer" }}>
                <div onClick={() => setOpen(c.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{c.name || "Unnamed"}</div>
                    {c.optIn ? <Pill tone="green">Opted in</Pill> : <Pill tone="amber">No opt-in</Pill>}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: T.steel, marginTop: 6 }}>{c.phone || "No phone"}</div>
                  <div style={{ fontSize: 13, color: T.steel, marginTop: 10 }}>
                    {c.vehicles.length} vehicle{c.vehicles.length !== 1 ? "s" : ""} · {count} job{count !== 1 ? "s" : ""}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {sel && (
        <Modal title={sel.name || "Unnamed"} onClose={() => setOpen(null)} wide>
          <div style={{ fontFamily: MONO, fontSize: 14, color: T.steel, marginBottom: 4 }}>{sel.phone || "No phone on file"}</div>
          <div style={{ fontSize: 13, color: T.steel, marginBottom: 20 }}>Customer since {sel.since}</div>

          <SectionLabel>Vehicles</SectionLabel>
          {sel.vehicles.length === 0 ? <Empty>No vehicle on file.</Empty> : sel.vehicles.map((v) => (
            <Card key={v.id} pad={13} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600 }}>{v.plate || "No plate"}</div>
                  <div style={{ fontSize: 13, color: T.steel, marginTop: 3 }}>{v.make} {v.model} {v.year && `· ${v.year}`}</div>
                </div>
                {v.odo && <div style={{ fontFamily: MONO, fontSize: 13, color: T.steel }}>{v.odo.toLocaleString()} km</div>}
              </div>
            </Card>
          ))}

          <div style={{ marginTop: 22 }}><SectionLabel>Job history</SectionLabel></div>
          {jobs.filter((j) => j.cust === sel.id).map((j) => (
            <div key={j.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${T.hair}`, fontSize: 14 }}>
              <div>
                <div>{j.lines.map((l) => l.name).join(" · ")}</div>
                <div style={{ fontSize: 12, color: T.steel, marginTop: 3 }}>{j.date} · {j.pay}</div>
              </div>
              <div style={{ fontFamily: MONO, fontWeight: 600 }}>{money(j.total)}</div>
            </div>
          ))}

          <div style={{ marginTop: 22 }}><SectionLabel>Upcoming reminders</SectionLabel></div>
          {reminders.filter((r) => r.cust === sel.id && r.status === "pending").length === 0
            ? <Empty>None scheduled.</Empty>
            : reminders.filter((r) => r.cust === sel.id && r.status === "pending").map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", fontSize: 14, borderBottom: `1px solid ${T.hair}` }}>
                <span>{r.service}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: T.steel }}>{r.due}</span>
              </div>
            ))}
        </Modal>
      )}

      {adding && (
        <Modal title="New customer" onClose={() => setAdding(null)}>
          <Field label="Name"><Input value={adding.name || ""} onChange={(e) => setAdding({ ...adding, name: e.target.value })} /></Field>
          <Field label="Phone" hint="needed for reminders"><Input mono value={adding.phone || ""} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} placeholder="079 000 0000" /></Field>
          <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, marginBottom: 20, cursor: "pointer" }}>
            <input type="checkbox" checked={!!adding.optIn} onChange={(e) => setAdding({ ...adding, optIn: e.target.checked })} style={{ width: 17, height: 17 }} />
            Happy to receive WhatsApp reminders
          </label>

          <SectionLabel>Vehicle</SectionLabel>
          <Field label="Plate"><Input mono value={adding.plate || ""} onChange={(e) => setAdding({ ...adding, plate: e.target.value })} placeholder="21-45678" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Make"><Input value={adding.make || ""} onChange={(e) => setAdding({ ...adding, make: e.target.value })} /></Field>
            <Field label="Model"><Input value={adding.model || ""} onChange={(e) => setAdding({ ...adding, model: e.target.value })} /></Field>
          </div>

          <Btn kind="dark" full onClick={() => {
            const v = adding.plate || adding.make ? [{ id: "v" + Date.now(), plate: adding.plate || "", make: adding.make || "", model: adding.model || "", year: "", odo: null }] : [];
            setCustomers((p) => [{ id: "c" + Date.now(), name: adding.name || "", phone: adding.phone || "", optIn: !!adding.optIn, since: today, vehicles: v }, ...p]);
            setAdding(null);
          }}>Save customer</Btn>
        </Modal>
      )}
    </>
  );
}

/* ── reminders ──────────────────────────────────────────── */
function Reminders({ reminders, setReminders, custById, vehById }) {
  const pending = reminders.filter((r) => r.status === "pending").sort((a, b) => a.due.localeCompare(b.due));
  const sent = reminders.filter((r) => r.status === "sent");

  const bucket = (d) => {
    if (d <= "2026-08-30") return "This week";
    if (d <= "2026-09-06") return "Next week";
    return "Later";
  };
  const groups = ["This week", "Next week", "Later"];

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <SectionLabel>Scheduled to go out</SectionLabel>
        {pending.length === 0 ? <Empty>Nothing scheduled.</Empty> : groups.map((g) => {
          const rows = pending.filter((r) => bucket(r.due) === g);
          if (!rows.length) return null;
          return (
            <div key={g} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: T.steel, marginBottom: 8, fontWeight: 500 }}>{g}</div>
              {rows.map((r) => {
                const c = custById(r.cust), v = vehById(r.veh);
                return (
                  <Card key={r.id} pad={14} style={{ marginBottom: 8, borderInlineStart: `3px solid ${c?.optIn ? T.green : T.amber}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 200 }}>
                        <div style={{ fontSize: 15, fontWeight: 500 }}>{c?.name}</div>
                        <div style={{ fontSize: 13, color: T.steel, marginTop: 3 }}>
                          {r.service} · {v?.plate}{r.dueKm ? ` · at ${r.dueKm.toLocaleString()} km` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontFamily: MONO, fontSize: 13, color: T.steel }}>{r.due}</span>
                        {c?.optIn
                          ? <Btn small kind="dark" onClick={() => setReminders((p) => p.map((x) => x.id === r.id ? { ...x, status: "sent" } : x))}>Send now</Btn>
                          : <Pill tone="amber">Needs opt-in</Pill>}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          );
        })}
      </div>

      {sent.length > 0 && (
        <>
          <SectionLabel>Already sent</SectionLabel>
          {sent.map((r) => {
            const c = custById(r.cust);
            return (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 2px", borderBottom: `1px solid ${T.hair}`, fontSize: 14, color: T.steel }}>
                <span>{c?.name} · {r.service}</span>
                <span style={{ fontFamily: MONO, fontSize: 13 }}>{r.due}</span>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

/* ── services catalog ───────────────────────────────────── */
function Services({ services, setServices }) {
  const [openCat, setOpenCat] = useState(1);
  const [adding, setAdding] = useState(null);

  return (
    <>
      <SectionLabel right={<span style={{ fontSize: 13, color: T.steel }}>{services.length} services</span>}>
        Service catalogue
      </SectionLabel>

      {CATEGORIES.map((cat) => {
        const rows = services.filter((s) => s.cat === cat.id);
        const open = openCat === cat.id;
        return (
          <Card key={cat.id} pad={0} style={{ marginBottom: 8, overflow: "hidden" }}>
            <button onClick={() => setOpenCat(open ? null : cat.id)} style={{
              width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "transparent", border: "none", padding: "15px 18px", cursor: "pointer", fontFamily: SANS,
            }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{cat.name}</span>
              <span style={{ fontSize: 13, color: T.steel }}>{rows.length} · {open ? "−" : "+"}</span>
            </button>
            {open && (
              <div style={{ padding: "0 18px 16px" }}>
                {rows.map((s) => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: `1px solid ${T.hair}`, gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 14 }}>{s.name}</div>
                      {s.rtype && (
                        <div style={{ fontSize: 12, color: T.steel, marginTop: 3 }}>
                          Reminder: {s.rkm ? `${s.rkm.toLocaleString()} km` : ""}{s.rkm && s.rmo ? " / " : ""}{s.rmo ? `${s.rmo} months` : ""}
                        </div>
                      )}
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 13, color: T.steel }}>{s.price ? money(s.price) : "—"}</span>
                  </div>
                ))}
                {rows.length === 0 && <div style={{ fontSize: 13, color: T.steel, padding: "12px 0", borderTop: `1px solid ${T.hair}` }}>Nothing here yet.</div>}
                <div style={{ marginTop: 12 }}>
                  <Btn small onClick={() => setAdding({ cat: cat.id })}>+ Add service to {cat.name}</Btn>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {adding && (
        <Modal title={`New service · ${CATEGORIES.find((c) => c.id === adding.cat)?.name}`} onClose={() => setAdding(null)}>
          <Field label="Service name"><Input value={adding.name || ""} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="Radiator flush" autoFocus /></Field>
          <Field label="Usual price" hint="optional"><Input mono value={adding.price || ""} onChange={(e) => setAdding({ ...adding, price: e.target.value })} placeholder="0.000" /></Field>

          <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, marginBottom: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={!!adding.remind} onChange={(e) => setAdding({ ...adding, remind: e.target.checked })} style={{ width: 17, height: 17 }} />
            Schedule a reminder after this service
          </label>

          {adding.remind && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 6 }}>
              <Field label="Due after" hint="km"><Input mono value={adding.rkm || ""} onChange={(e) => setAdding({ ...adding, rkm: e.target.value })} placeholder="5000" /></Field>
              <Field label="Or after" hint="months"><Input mono value={adding.rmo || ""} onChange={(e) => setAdding({ ...adding, rmo: e.target.value })} placeholder="6" /></Field>
            </div>
          )}

          <Btn kind="dark" full disabled={!(adding.name || "").trim()} onClick={() => {
            setServices((p) => [...p, {
              id: "s" + Date.now(), name: adding.name.trim(), cat: adding.cat,
              price: Number(adding.price) || 0,
              rtype: adding.remind ? adding.name.trim().toLowerCase().replace(/\s+/g, "_") : null,
              rkm: adding.remind ? Number(adding.rkm) || null : null,
              rmo: adding.remind ? Number(adding.rmo) || null : null,
            }]);
            setAdding(null);
          }}>Save service</Btn>
        </Modal>
      )}
    </>
  );
}
