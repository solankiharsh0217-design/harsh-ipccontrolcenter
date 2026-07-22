import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X, Search, Plus, Settings2 } from "lucide-react";
import type { CatalogProduct } from "@/lib/roas/seminarProduct";

interface Props {
  value: string | null;                     // product id
  productLabel?: string;                    // shown when value is set but options are still loading
  onPick: (p: CatalogProduct) => void;
  onClear: () => void;
  onCreateNew?: () => void;
  onManage?: () => void;
  options: CatalogProduct[];
  placeholder?: string;
  disabled?: boolean;
}

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** App-style searchable combobox for seminar product/offer selection. */
export default function SearchableProductSelect({
  value, productLabel, onPick, onClear, onCreateNew, onManage, options, placeholder, disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => { if (open) { setQuery(""); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((p) =>
      p.product_name.toLowerCase().includes(q) ||
      (p.business_unit || "").toLowerCase().includes(q));
  }, [options, query]);

  const selected = useMemo(() => options.find((o) => o.id === value) || null, [options, value]);
  const displayLabel = selected?.product_name || productLabel || "";

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="srInput"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, textAlign: "left", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }}
      >
        <span style={{ color: value ? "inherit" : "var(--mt)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayLabel || placeholder || "Select saved product…"}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--mt)" }}>
          {value && !disabled && (
            <X className="w-3.5 h-3.5" onClick={(e) => { e.stopPropagation(); onClear(); }} style={{ cursor: "pointer" }} />
          )}
          <ChevronDown className="w-3.5 h-3.5" />
        </span>
      </button>
      {open && (
        <div style={{
          position: "absolute", zIndex: 40, top: "100%", left: 0, right: 0, marginTop: 4,
          background: "var(--ww)", border: "1px solid var(--bd)", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.08)", maxHeight: 340, display: "flex", flexDirection: "column",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: "1px solid var(--bd)", background: "var(--off)" }}>
            <Search className="w-3.5 h-3.5" style={{ color: "var(--mt)" }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              style={{ flex: 1, background: "transparent", outline: "none", fontSize: 12, border: "none", fontFamily: "'Jost',sans-serif" }}
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--mt)" }}>
                No products match "{query}".
              </div>
            ) : filtered.map((p) => {
              const gstLabel = p.gst_applicable
                ? "GST Included"
                : "No GST";
              // program_products stores product_price_including_gst → the price shown here is gross.
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onPick(p); setOpen(false); }}
                  style={{
                    width: "100%", textAlign: "left", padding: "8px 12px", background: p.id === value ? "var(--off)" : "transparent",
                    border: "none", cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 12.5, color: "var(--kk)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--off)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = p.id === value ? "var(--off)" : "transparent")}
                >
                  <div style={{ fontWeight: 500 }}>
                    {p.product_name}
                    {p.business_unit ? <span style={{ color: "var(--mt)", fontSize: 10.5, marginLeft: 6 }}>· {p.business_unit}</span> : null}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--mt)", marginTop: 2 }}>
                    {inr(Number(p.product_price_including_gst || 0))} · {gstLabel} · {Number(p.gst_rate || 0)}%
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ borderTop: "1px solid var(--bd)", padding: 6, display: "flex", gap: 6, background: "var(--off)" }}>
            {onCreateNew && (
              <button type="button" onClick={() => { setOpen(false); onCreateNew(); }}
                className="srBtn srBtn-g" style={{ height: 30, fontSize: 11, flex: 1 }}>
                <Plus className="w-3 h-3" /> Add New Product
              </button>
            )}
            {onManage && (
              <button type="button" onClick={() => { setOpen(false); onManage(); }}
                className="srBtn srBtn-g" style={{ height: 30, fontSize: 11, flex: 1 }}>
                <Settings2 className="w-3 h-3" /> Manage Products
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
