export default function AttributionMethodSelect({
  onPickManual, onPickAuto,
}: { onPickManual: () => void; onPickAuto: () => void }) {
  return (
    <div style={{ maxWidth: 900, padding: "32px 4px" }}>
      <div className="page-title">Media Buyer Attribution</div>
      <p className="page-sub">Choose how you want to calculate ROAS for this webinar.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <MethodCard
          title="Manual Upload" badge="Current Method" badgeBg="#F7F6F3" badgeFg="#888"
          desc="Upload individual lead sheets for each media buyer, then upload the sales sheet and enter ad spends manually."
          best={["One-time calculations", "When sheet structure changes often", "When data is not stored in one master sheet"]}
          btnLabel="Continue with Manual Upload" btnBg="#0a0a0a" btnFg="#fff" btnHover="#222" onClick={onPickManual}
        />
        <MethodCard
          title="Automatic Fetching" badge="Recommended" badgeBg="#FBF6E9" badgeFg="#7A5E10"
          desc="Connect one master Google Sheet workbook with multiple tabs for media buyer leads, sales, and ad spends. The system will fetch, match, and calculate automatically."
          best={["Repeated webinar calculations", "Fixed media buyer sheet structure", "Faster attribution with fewer uploads"]}
          btnLabel="Continue with Automatic Fetching" btnBg="#C8A84B" btnFg="#0a0a0a" btnHover="#B8973F" onClick={onPickAuto}
        />
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: "#888", textAlign: "center", fontFamily: "'Jost',sans-serif" }}>
        You can use either method anytime. Manual upload will always remain available as a fallback.
      </div>
    </div>
  );
}

function MethodCard({
  title, badge, badgeBg, badgeFg, desc, best, btnLabel, btnBg, btnFg, btnHover, onClick,
}: {
  title: string; badge: string; badgeBg: string; badgeFg: string;
  desc: string; best: string[];
  btnLabel: string; btnBg: string; btnFg: string; btnHover: string; onClick: () => void;
}) {
  return (
    <div style={{ border: "1px solid #E8E5DE", borderRadius: 12, padding: 24, background: "#fff", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 500 }}>{title}</div>
        <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 12, background: badgeBg, color: badgeFg, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 500 }}>{badge}</span>
      </div>
      <p style={{ fontSize: 12.5, color: "#888", lineHeight: 1.6, marginBottom: 16 }}>{desc}</p>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "#888", marginBottom: 8 }}>Best for</div>
      <ul style={{ fontSize: 12.5, color: "#0a0a0a", lineHeight: 1.8, paddingLeft: 18, margin: 0, marginBottom: 20, flex: 1 }}>
        {best.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
      <button
        onClick={onClick}
        onMouseEnter={(e) => (e.currentTarget.style.background = btnHover)}
        onMouseLeave={(e) => (e.currentTarget.style.background = btnBg)}
        style={{ height: 42, borderRadius: 8, border: "none", background: btnBg, color: btnFg, fontFamily: "'Jost',sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "background .15s" }}
      >{btnLabel}</button>
    </div>
  );
}
