import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import type { SaleDetail } from "@/lib/roasExport";
import AttributionResultsView from "@/components/roas/AttributionResultsView";
import AttributionAuditPanel from "@/components/roas/AttributionAuditPanel";
import QuickSaveInput from "@/components/QuickSaveInput";
import AttributionMethodSelect from "@/components/roas/AttributionMethodSelect";
import AutoWizardV6 from "@/components/roas/auto/AutoWizardV6";
import DailyLeadReportingModule from "@/components/roas/DailyLeadReportingModule";
import { calculateAttribution, toLegacyPayload, DEAL_VALUE as ENGINE_DEAL, type AttributionResult, type AttributionSnapshot } from "@/lib/roas/attributionEngine";

/* ====================================================================
   ROAS Calculator v2 — single-page module with three tabs:
   1) Media Buyer Attribution
   2) Total ROAS
   3) Data Sources
   Visual + interaction spec ported directly from ROAS_Calculator_v2.html
   ==================================================================== */

export const styles = `
.rcv2 *,.rcv2 *::before,.rcv2 *::after{box-sizing:border-box}
.rcv2{
  --gold:#C8A84B;--gp:#FBF6E9;--gm:#E8D49A;
  --kk:#0a0a0a;--ww:#fff;--off:#F7F6F3;
  --bd:#E8E5DE;--mt:#888;--ml:#bbb;
  --rd:#DC2626;--rp:#FEF2F2;--rb:#FECACA;
  --gn:#16A34A;--gnp:#F0FDF4;--gnb:#BBF7D0;
  --bl:#2563EB;
  --amb:#CA8A04;--ap:#FFFBEB;--ab:#FDE68A;
  font-family:'Jost',sans-serif;color:var(--kk);
}
.rcv2 .page-tabs{display:flex;gap:0;border-bottom:1px solid var(--bd);background:var(--ww);margin:-40px -40px 0;padding:0 28px}
.rcv2 .ptab{padding:12px 18px;background:transparent;border:none;border-bottom:2px solid transparent;font-family:'Jost',sans-serif;font-size:13px;font-weight:400;color:var(--mt);cursor:pointer;transition:all .12s;margin-bottom:-1px;display:flex;align-items:center;gap:7px}
.rcv2 .ptab:hover{color:var(--kk)}
.rcv2 .ptab.on{color:var(--kk);border-bottom-color:var(--gold);font-weight:500}
.rcv2 .content{padding:32px 4px;max-width:900px}
.rcv2 .page-title{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:400;margin-bottom:5px}
.rcv2 .page-sub{font-size:13px;font-weight:300;color:var(--mt);margin-bottom:28px;line-height:1.6}
.rcv2 .btn{height:36px;padding:0 18px;border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:500;cursor:pointer;border:none;display:inline-flex;align-items:center;gap:6px;transition:opacity .12s}
.rcv2 .btn-k{background:var(--kk);color:var(--ww)}
.rcv2 .btn-k:hover{opacity:.82}
.rcv2 .btn-g{background:var(--ww);color:var(--kk);border:1px solid var(--bd)}
.rcv2 .btn-g:hover{background:var(--off)}
.rcv2 .btn-sm{height:30px;padding:0 13px;font-size:11.5px}
.rcv2 .fl{display:block;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.08em;color:var(--kk);margin-bottom:7px}
.rcv2 .fi,.rcv2 .fsel{width:100%;height:40px;border:1px solid var(--bd);border-radius:8px;padding:0 12px;font-family:'Jost',sans-serif;font-size:13px;color:var(--kk);background:var(--ww);outline:none;transition:border-color .12s}
.rcv2 .fi:focus,.rcv2 .fsel:focus{border-color:var(--gold)}
.rcv2 .fi::placeholder{color:#ccc}
.rcv2 .two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.rcv2 .three-col{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.rcv2 .sl{font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:var(--mt);margin-bottom:12px;padding-bottom:9px;border-bottom:1px solid var(--bd)}
.rcv2 .step-card{border:1px solid var(--bd);border-radius:12px;padding:22px 24px;margin-bottom:16px;background:var(--ww)}
.rcv2 .step-card.active{border-color:var(--gold);background:var(--gp)}
.rcv2 .step-header{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.rcv2 .step-num{width:28px;height:28px;border-radius:50%;background:var(--kk);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:13px;color:var(--gold);font-weight:500;flex-shrink:0}
.rcv2 .step-card.active .step-num{background:var(--gold);color:var(--kk)}
.rcv2 .step-title{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:500}
.rcv2 .step-sub{font-size:11.5px;color:var(--mt);margin-top:2px}
.rcv2 .mb-list{display:flex;flex-direction:column;gap:12px;margin-bottom:14px}
.rcv2 .mb-row{background:var(--off);border:1px solid var(--bd);border-radius:10px;padding:16px 18px}
.rcv2 .mb-row-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.rcv2 .mb-row-title{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:500}
.rcv2 .mb-remove{width:26px;height:26px;border:1px solid var(--bd);border-radius:6px;background:var(--ww);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--mt);font-size:12px;transition:all .12s}
.rcv2 .mb-remove:hover{background:var(--rp);color:var(--rd);border-color:var(--rb)}
.rcv2 .add-mb-btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;border:1.5px dashed var(--bd);border-radius:10px;cursor:pointer;color:var(--mt);font-size:12.5px;background:transparent;width:100%;transition:all .12s;font-family:'Jost',sans-serif}
.rcv2 .add-mb-btn:hover{border-color:var(--gold);color:var(--kk);background:var(--gp)}
.rcv2 .sheet-opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.rcv2 .sheet-opts.three{grid-template-columns:1fr 1fr 1fr}
.rcv2 .sheet-opt{border:1px solid var(--bd);border-radius:9px;padding:13px 15px;cursor:pointer;transition:all .13s;background:var(--ww)}
.rcv2 .sheet-opt:hover{border-color:var(--ml);background:var(--off)}
.rcv2 .sheet-opt.sel{border-color:var(--gold);background:var(--gp)}
.rcv2 .so-icon{font-size:16px;margin-bottom:6px}
.rcv2 .so-title{font-size:12.5px;font-weight:500;margin-bottom:3px}
.rcv2 .so-desc{font-size:11px;color:var(--mt);line-height:1.5}
.rcv2 .uz-compact{border:1.5px dashed var(--bd);border-radius:9px;padding:18px 16px;text-align:center;cursor:pointer;transition:all .15s;background:var(--ww);position:relative;margin-top:10px}
.rcv2 .uz-compact:hover,.rcv2 .uz-compact.drag{border-color:var(--gold);background:var(--gp)}
.rcv2 .uz-compact.done{border-style:solid;border-color:var(--gold);background:var(--gp)}
.rcv2 .uz-compact input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.rcv2 .uz-icon{font-size:20px;margin-bottom:6px}
.rcv2 .uz-title{font-size:13px;font-weight:500;margin-bottom:3px}
.rcv2 .uz-sub{font-size:11px;color:var(--mt)}
.rcv2 .uz-done-name{font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:500;margin-bottom:2px}
.rcv2 .uz-done-meta{font-size:10.5px;color:var(--mt)}
.rcv2 .sum-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.rcv2 .sum-card{border-radius:10px;padding:16px 18px}
.rcv2 .sum-card.plain{background:var(--off);border:1px solid var(--bd)}
.rcv2 .sum-card.gold{background:var(--gp);border:1px solid var(--gm)}
.rcv2 .sum-card.grn{background:var(--gnp);border:1px solid var(--gnb)}
.rcv2 .sum-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--mt);margin-bottom:7px}
.rcv2 .sum-val{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:500;line-height:1;margin-bottom:2px}
.rcv2 .sum-card.gold .sum-val{color:var(--gold)}
.rcv2 .sum-card.grn .sum-val{color:var(--gn)}
.rcv2 .sum-note{font-size:10.5px;color:var(--mt)}
.rcv2 .attr-table{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:20px}
.rcv2 .attr-table th{text-align:left;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.12em;color:var(--mt);padding:10px 16px;border-bottom:1px solid var(--bd);background:var(--off)}
.rcv2 .attr-table td{padding:14px 16px;border-bottom:1px solid var(--bd);vertical-align:middle}
.rcv2 .attr-table tr:last-child td{border-bottom:none}
.rcv2 .attr-table tbody tr:hover td{background:var(--off)}
.rcv2 .mb-name-cell{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:500}
.rcv2 .mb-sub2{font-size:10.5px;color:var(--mt);margin-top:2px}
.rcv2 .roas-val{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:500}
.rcv2 .roas-good{color:var(--gn)}
.rcv2 .roas-avg{color:var(--amb)}
.rcv2 .roas-bad{color:var(--rd)}
.rcv2 .mini-bar-wrap{display:flex;align-items:center;gap:7px}
.rcv2 .mini-bar{height:5px;width:60px;border-radius:3px;background:var(--gnp);border:1px solid var(--gnb);overflow:hidden}
.rcv2 .mini-bar-fill{height:100%;background:var(--gn);transition:width .4s ease}
.rcv2 .unmatched-box{background:var(--ap);border:1px solid var(--ab);border-radius:10px;padding:16px 18px;margin-bottom:16px}
.rcv2 .unmatched-title{font-size:12px;font-weight:500;color:var(--amb);margin-bottom:8px}
.rcv2 .unmatched-list{font-size:12px;color:var(--amb);line-height:1.8}
.rcv2 .info-box{background:var(--gp);border:1px solid var(--gm);border-radius:9px;padding:12px 14px;margin-bottom:18px;font-size:12px;color:#7A5E10;line-height:1.6}
.rcv2 .wpills{display:flex;gap:8px}
.rcv2 .wpill{height:34px;padding:0 16px;border-radius:20px;border:1px solid var(--bd);background:var(--ww);font-family:'Jost',sans-serif;font-size:12px;color:var(--mt);cursor:pointer;transition:all .12s}
.rcv2 .wpill:hover{border-color:var(--ml);color:var(--kk)}
.rcv2 .wpill.sel{background:var(--kk);color:var(--ww);border-color:var(--kk)}
.rcv2 .prog-wrap{margin:20px 0}
.rcv2 .prog-lbl{font-size:11px;color:var(--mt);margin-bottom:6px}
.rcv2 .prog-bg{height:3px;background:var(--bd);border-radius:2px;overflow:hidden}
.rcv2 .prog-fill{height:100%;background:var(--gold);border-radius:2px;transition:width .25s}
.rcv2 .ds-card{border:1px solid var(--bd);border-radius:11px;padding:18px 20px;display:flex;align-items:flex-start;gap:14px;transition:background .12s;margin-bottom:12px}
.rcv2 .ds-card:hover{background:var(--off)}
.rcv2 .ds-icon{width:38px;height:38px;border-radius:9px;background:var(--off);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.rcv2 .ds-name{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:500;margin-bottom:3px}
.rcv2 .ds-desc{font-size:12px;color:var(--mt);margin-bottom:6px;line-height:1.5}
.rcv2 .ds-url{font-size:11px;color:var(--bl);text-decoration:none;word-break:break-all}
.rcv2 .ds-actions{display:flex;gap:6px;margin-left:auto;flex-shrink:0}
.rcv2 .ds-btn{width:28px;height:28px;border:1px solid var(--bd);border-radius:6px;background:var(--ww);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--mt);font-size:12px;transition:all .12s}
.rcv2 .ds-btn:hover{background:var(--off);color:var(--kk)}
.rcv2 .ds-btn.del:hover{background:var(--rp);color:var(--rd);border-color:var(--rb)}
.rcv2 .ds-status{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:500;padding:2px 8px;border-radius:20px}
.rcv2 .ds-status.live{background:var(--gnp);color:var(--gn);border:1px solid var(--gnb)}
.rcv2 .ds-status.manual{background:var(--off);color:var(--mt);border:1px solid var(--bd)}
.rcv2 .add-ds-form{border:1.5px dashed var(--bd);border-radius:11px;padding:20px 22px}
.rcv2 .add-ds-title{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.1em;color:var(--mt);margin-bottom:14px}

/* === Wizard === */
.rcv2 .wiz{max-width:680px;padding:32px 36px 8px}
.rcv2 .wiz.wide{max-width:900px}
.rcv2 .wiz-prog{display:flex;align-items:flex-start;justify-content:space-between;position:sticky;top:0;background:var(--ww);padding:14px 0 18px;z-index:5;border-bottom:1px solid transparent}
.rcv2 .wiz-step{display:flex;flex-direction:column;align-items:center;flex:0 0 auto;width:90px;text-align:center}
.rcv2 .wiz-circle{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:13px;border:1px solid var(--bd);background:var(--off);color:var(--mt);transition:all .25s}
.rcv2 .wiz-step.active .wiz-circle{background:var(--kk);color:var(--ww);border-color:var(--kk)}
.rcv2 .wiz-step.done .wiz-circle{background:var(--gold);color:var(--ww);border-color:var(--gold)}
.rcv2 .wiz-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--mt);margin-top:8px}
.rcv2 .wiz-step.active .wiz-lbl{color:var(--kk)}
.rcv2 .wiz-step.done .wiz-lbl{color:var(--gold)}
.rcv2 .wiz-step.locked .wiz-circle{background:var(--ww);color:var(--ml);border-color:var(--bd)}
.rcv2 .wiz-step.locked .wiz-lbl{color:var(--ml)}
.rcv2 .wiz-step:not(.active):not(.locked):hover .wiz-lbl{color:var(--gold)}
.rcv2 .wiz-line{flex:1;height:2px;background:var(--bd);margin:14px 4px 0;transition:background .25s}
.rcv2 .wiz-line.done{background:var(--gold)}
.rcv2 .wiz-body{padding-top:10px;animation:wzfade .2s ease-out}
@keyframes wzfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.rcv2 .wiz-h{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:400;margin-bottom:6px}
.rcv2 .wiz-sub{font-size:13px;font-weight:300;color:var(--mt);margin-bottom:28px;line-height:1.6}
.rcv2 .wiz-nav{display:flex;justify-content:flex-end;gap:10px;margin-top:28px;padding-top:18px;border-top:1px solid var(--bd)}
.rcv2 .wiz-btn{height:40px;padding:0 22px;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px;font-weight:500;cursor:pointer;border:none;display:inline-flex;align-items:center;gap:6px;transition:opacity .12s}
.rcv2 .wiz-btn-k{background:var(--kk);color:var(--ww)}
.rcv2 .wiz-btn-k:hover{opacity:.85}
.rcv2 .wiz-btn-g{background:var(--ww);color:var(--kk);border:1px solid var(--bd)}
.rcv2 .wiz-btn-g:hover{background:var(--off)}
.rcv2 .err{color:var(--rd);font-size:11px;margin-top:6px}
.rcv2 .fi-wrap{position:relative}
.rcv2 .fi-h{height:44px}
.rcv2 .fi-plus{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:22px;height:22px;border-radius:6px;border:none;background:transparent;color:var(--mt);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:all .12s}
.rcv2 .fi-plus:hover{background:var(--gp);color:var(--gold)}
.rcv2 .saved-conf{color:var(--gn);font-size:11px;margin-top:6px;animation:wzfade .25s ease-out}
.rcv2 .tpl-dd{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--ww);border:1px solid var(--bd);border-radius:8px;max-height:220px;overflow-y:auto;z-index:10;padding:6px 0}
.rcv2 .tpl-dd-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--mt);padding:6px 12px}
.rcv2 .tpl-it{padding:8px 12px;font-size:13px;cursor:pointer}
.rcv2 .tpl-it:hover{background:var(--off)}

/* media buyer compact card (step 2) */
.rcv2 .mb-card{background:var(--ww);border:1px solid var(--bd);border-radius:12px;padding:18px 20px;margin-bottom:12px;position:relative;animation:wzfade .18s ease-out}
.rcv2 .mb-card.warn{border-color:var(--ab)}
.rcv2 .mb-card-hd{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.rcv2 .mb-av{width:32px;height:32px;border-radius:50%;background:var(--kk);color:var(--gold);font-family:'Cormorant Garamond',serif;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.rcv2 .mb-hd-t{font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:500}
.rcv2 .mb-hd-s{font-size:11px;color:var(--mt);margin-top:1px}
.rcv2 .mb-card-x{margin-left:auto;width:28px;height:28px;border:1px solid var(--bd);border-radius:6px;background:var(--ww);cursor:pointer;color:var(--mt);font-size:12px;transition:all .12s}
.rcv2 .mb-card-x:hover{background:var(--rp);color:var(--rd);border-color:var(--rb)}
.rcv2 .fl-sm{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--mt);margin-bottom:6px}
.rcv2 .fi-sm{height:38px;width:100%;border:1px solid var(--bd);border-radius:8px;padding:0 12px;font-family:'Jost',sans-serif;font-size:13px;background:var(--ww);outline:none;transition:border-color .12s}
.rcv2 .fi-sm:focus{border-color:var(--gold)}
.rcv2 .fi-sm.bad{border-color:var(--rd)}
.rcv2 .src-opt{border:1px solid var(--bd);border-radius:8px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:all .12s;background:var(--ww);height:52px}
.rcv2 .src-opt:hover{background:var(--off)}
.rcv2 .src-opt.sel{border-color:var(--gold);background:var(--gp)}
.rcv2 .src-opt-ic{width:24px;height:24px;border-radius:6px;background:var(--off);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
.rcv2 .src-opt-t{font-size:12px;font-weight:500;line-height:1.2}
.rcv2 .src-opt-s{font-size:10px;color:var(--mt);margin-top:1px}
.rcv2 .row-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.rcv2 .conn-good{color:var(--gn);font-size:10px;margin-top:8px}
.rcv2 .conn-bad{color:var(--amb);font-size:10px;margin-top:8px}
.rcv2 .helper{font-size:10px;color:var(--mt);margin-top:6px}
.rcv2 .spend-row{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--bd);gap:12px}
.rcv2 .spend-row:last-child{border-bottom:none}
.rcv2 .spend-row .left{display:flex;align-items:center;gap:12px;flex:1;min-width:0}
.rcv2 .spend-av{width:28px;height:28px;border-radius:50%;background:var(--kk);color:var(--gold);font-family:'Cormorant Garamond',serif;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.rcv2 .spend-name{font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:500}
.rcv2 .spend-input-wrap{position:relative;width:160px;flex-shrink:0}
.rcv2 .spend-input-wrap .pfx{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--mt);font-size:13px;pointer-events:none}
.rcv2 .spend-inp{width:100%;height:38px;border:1px solid var(--bd);border-radius:8px;padding:0 12px 0 24px;font-family:'Jost',sans-serif;font-size:13px;outline:none;transition:border-color .12s}
.rcv2 .spend-inp:focus{border-color:var(--gold)}
.rcv2 .spend-inp.bad{border-color:var(--rd)}
.rcv2 .spend-tot{text-align:right;font-size:12px;color:var(--mt);margin-top:14px}
.rcv2 .calc-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px}
.rcv2 .calc-bar{width:320px;height:3px;background:var(--off);border-radius:2px;overflow:hidden;margin-top:14px}
.rcv2 .calc-bar-fill{height:100%;background:var(--gold);transition:width .15s linear}
.rcv2 .calc-msg{font-size:13px;color:var(--mt);font-weight:300}
`;

// ───────────── helpers ─────────────
function parseCSV(text: string): string[][] {
  return text.split("\n").map((line) => {
    const cols: string[] = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQ = !inQ;
      else if (c === "," && !inQ) { cols.push(cur.trim().replace(/^"|"$/g, "")); cur = ""; }
      else cur += c;
    }
    cols.push(cur.trim().replace(/^"|"$/g, ""));
    return cols;
  }).filter((r) => r.some((c) => c.trim()));
}
function findCol(headers: string[], kws: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || "").toLowerCase().trim();
    if (kws.some((k) => h.includes(k))) return i;
  }
  return -1;
}
function getHeader(rows: string[][]) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i].join(" ").toLowerCase();
    if (r.includes("email") || r.includes("name") || r.includes("phone")) return { idx: i, headers: rows[i] };
  }
  return { idx: 0, headers: rows[0] || [] };
}
function cleanPhone(p: string) { return (p || "").replace(/['"+ \-()]/g, "").replace(/^91/, "").replace(/^0/, "").trim(); }
function normName(n: string) { return (n || "").toLowerCase().trim().replace(/\s+/g, " "); }
type Person = { name: string; email: string; phone: string };
function extractPeople(rows: string[][]): Person[] {
  const { idx, headers } = getHeader(rows);
  const eC = findCol(headers, ["email", "mail"]);
  const pC = findCol(headers, ["phone", "mobile", "contact", "number", "whatsapp", "mob"]);
  const nC = findCol(headers, ["name", "attendee", "participant", "buyer", "customer", "student"]);
  return rows.slice(idx + 1).map((r) => ({
    name: nC >= 0 ? r[nC] || "" : "",
    email: eC >= 0 ? (r[eC] || "").toLowerCase().trim() : "",
    phone: pC >= 0 ? cleanPhone(r[pC] || "") : "",
  })).filter((p) => p.email || p.phone || p.name);
}
function matchSale(sale: Person, list: Person[]) {
  if (sale.email) { const m = list.find((p) => p.email && p.email === sale.email); if (m) return m; }
  if (sale.phone && sale.phone.length >= 8) { const m = list.find((p) => p.phone && p.phone === sale.phone); if (m) return m; }
  if (sale.name && sale.name.length > 2) {
    const sn = normName(sale.name);
    return list.find((p) => {
      const pn = normName(p.name); if (!pn) return false;
      if (pn === sn) return true;
      const sp = sn.split(" "), pp = pn.split(" ");
      return sp.some((s) => s.length > 3 && pp.some((q) => q === s));
    }) || null;
  }
  return null;
}
const inr = (n: number) => "₹" + (n || 0).toLocaleString("en-IN");
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const roasClass = (n: number) => (n >= 10 ? "roas-good" : n >= 5 ? "roas-avg" : "roas-bad");

// ───────────── types ─────────────
type SheetMode = "url" | "csv";
type MB = { id: number; name: string; spend: string; leads: string; mode: SheetMode; url: string; fileName?: string; fileMeta?: string; data: string[][] };
type AttrRow = { name: string; spend: number; leads: number; matched: number; revenue: number };
type HistoryRow = { id?: string; campaign: string; date: string; spend: number; revenue: number; sales: number; roas: number };
type DataSource = { id?: string; name: string; type: string; url: string; description: string; status: "live" | "manual"; meta?: string };

const DEAL_VALUE = 118000;

// ───────────── component ─────────────
type ToolKey = "home" | "attr" | "total" | "sources";

export default function RoasCalculator() {
  const { user } = useAuth();
  const [tool, setTool] = useState<ToolKey>("home");

  return (
    <div className="rcv2">
      <style>{styles}</style>
      <div className="content">
        {tool === "home" && <RoasLauncher onPick={(t) => setTool(t)} />}
        {tool !== "home" && (
          <button
            onClick={() => setTool("home")}
            style={{ background: "transparent", border: "none", color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "'Jost',sans-serif", marginBottom: 8 }}
          >
            ← Back to ROAS Tools
          </button>
        )}
        {tool === "attr" && <AttrTabWrapper userId={user?.id} />}
        {tool === "total" && <TotalTab userId={user?.id} />}
        {tool === "sources" && <SourcesTab userId={user?.id} />}
      </div>
    </div>
  );
}

function RoasLauncher({ onPick }: { onPick: (t: ToolKey) => void }) {
  const cards: { key: ToolKey; tag: string; title: string; desc: string; btn: string; primary?: boolean }[] = [
    { key: "attr", tag: "Sales Attribution", title: "Media Buyer Attribution",
      desc: "Attribute sales to media buyers using manual uploads or automatic attribution from a master Google Sheet.",
      btn: "Open Attribution" },
    { key: "total", tag: "Overall ROAS", title: "Total ROAS / Row-Level Calculation",
      desc: "Calculate overall ROAS for a webinar or campaign using total ad spend and sales data.",
      btn: "Open Total ROAS" },
    { key: "daily", tag: "New", title: "Daily Lead Reporting",
      desc: "Enter daily Meta ad spends and metrics manually, fetch lead counts from Google Sheets by date, and calculate daily CPL per media buyer.",
      btn: "Open Daily Reporting", primary: true },
    { key: "sources", tag: "Settings", title: "Data Sources",
      desc: "Manage saved Google Sheet links, reusable names, data sources, and reporting templates.",
      btn: "Open Data Sources" },
  ];
  return (
    <div style={{ maxWidth: 980, padding: "32px 4px" }}>
      <div className="page-title">ROAS Calculator</div>
      <p className="page-sub">Choose the ROAS or reporting tool you want to use.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {cards.map((c) => (
          <div key={c.key} style={{ border: "1px solid #E8E5DE", borderRadius: 12, padding: 24, background: "#fff", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 500 }}>{c.title}</div>
              <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 12, background: c.tag === "New" ? "#FBF6E9" : "#F7F6F3", color: c.tag === "New" ? "#7A5E10" : "#888", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 500 }}>{c.tag}</span>
            </div>
            <p style={{ fontSize: 12.5, color: "#888", lineHeight: 1.6, marginBottom: 20, flex: 1 }}>{c.desc}</p>
            <button
              onClick={() => onPick(c.key)}
              style={{ height: 42, borderRadius: 8, border: "none", background: c.primary ? "#C8A84B" : "#0a0a0a", color: c.primary ? "#0a0a0a" : "#fff", fontFamily: "'Jost',sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
            >{c.btn}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================================================================
// TAB 1 WRAPPER: Method selection → Manual or Automatic wizard
// ===================================================================
function AttrTabWrapper({ userId }: { userId?: string }) {
  const [method, setMethod] = useState<"none" | "manual" | "auto">("none");
  if (method === "none") {
    return (
      <AttributionMethodSelect
        onPickManual={() => setMethod("manual")}
        onPickAuto={() => setMethod("auto")}
      />
    );
  }
  if (method === "auto") {
    return <AutoWizardV6 onBackToMethod={() => setMethod("none")} />;
  }
  return <AttrTab userId={userId} onBackToMethod={() => setMethod("none")} />;
}

// ===================================================================
// TAB 1: MEDIA BUYER ATTRIBUTION — 4-STEP WIZARD
// ===================================================================
function initials(name: string) {
  const w = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "";
  if (w.length === 1) return w[0][0].toUpperCase();
  return (w[0][0] + w[w.length - 1][0]).toUpperCase();
}

function AttrTab({ userId, onBackToMethod }: { userId?: string; onBackToMethod?: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [calculating, setCalculating] = useState(false);

  // Step 1
  const [wbName, setWbName] = useState("");
  const [wbDate, setWbDate] = useState(new Date().toISOString().slice(0, 10));
  const [wbType, setWbType] = useState("1-day");
  const [wbErr, setWbErr] = useState("");
  const [dateErr, setDateErr] = useState("");
  const [savedConf, setSavedConf] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [showDD, setShowDD] = useState(false);
  const ddRef = useRef<HTMLDivElement>(null);

  // Step 2 — buyers (no spend here)
  const [mbs, setMbs] = useState<MB[]>([{ id: 1, name: "", spend: "", leads: "", mode: "url", url: "", data: [] }]);
  const idRef = useRef(2);

  // Step 3 — sales sheet + spends
  const [salesMode, setSalesMode] = useState<SheetMode>("url");
  const [salesUrl, setSalesUrl] = useState("");
  const [salesData, setSalesData] = useState<string[][]>([]);
  const [salesFile, setSalesFile] = useState<{ name: string; meta: string } | null>(null);
  const [touchedCalc, setTouchedCalc] = useState(false);

  // Step 4
  const [progPct, setProgPct] = useState(0);
  const [calcMsg, setCalcMsg] = useState("");
  const [results, setResults] = useState<{ rows: AttrRow[]; unmatched: Person[]; salesDetail: SaleDetail[]; totals: { spend: number; revenue: number; sales: number; leads: number } } | null>(null);
  const [engineResult, setEngineResult] = useState<AttributionResult | null>(null);
  const [lastHashes, setLastHashes] = useState<{ input: string; output: string } | null>(null);
  const [consistency, setConsistency] = useState<{ sameInputSameOutput: boolean | null; sameInputDifferentOutput: boolean }>({ sameInputSameOutput: null, sameInputDifferentOutput: false });
  const [savedHist, setSavedHist] = useState(false);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // load templates
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("webinar_templates").select("id,name").order("created_at", { ascending: false }).limit(200);
      setTemplates((data || []) as any);
    })();
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setShowDD(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filteredTpl = templates.filter((t) =>
    !wbName.trim() ? true : t.name.toLowerCase().includes(wbName.toLowerCase())
  );

  const saveTemplate = async () => {
    const n = wbName.trim();
    if (!n || !userId) return;
    const exists = templates.some((t) => t.name.toLowerCase() === n.toLowerCase());
    if (exists) { setSavedConf(true); setTimeout(() => setSavedConf(false), 1500); return; }
    const { data, error } = await supabase.from("webinar_templates").insert({ name: n, created_by: userId }).select().single();
    if (!error && data) {
      setTemplates((p) => [{ id: data.id, name: data.name }, ...p]);
      setSavedConf(true);
      setTimeout(() => setSavedConf(false), 1500);
    }
  };

  // buyer ops
  const addMB = () => setMbs((p) => [...p, { id: idRef.current++, name: "", spend: "", leads: "", mode: "url", url: "", data: [] }]);
  const removeMB = (id: number) => setMbs((p) => p.filter((m) => m.id !== id));
  const updateMB = (id: number, patch: Partial<MB>) => setMbs((p) => p.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const handleMBFile = (id: number, f: File) => {
    const r = new FileReader();
    r.onload = (e) => {
      const rows = parseCSV(String(e.target?.result || ""));
      updateMB(id, {
        data: rows, fileName: f.name,
        fileMeta: (f.size / 1024).toFixed(1) + " KB · " + rows.length + " rows",
        leads: String(Math.max(0, rows.length - 1)),
      });
    };
    r.readAsText(f);
  };
  const handleSalesFile = (f: File) => {
    const r = new FileReader();
    r.onload = (e) => {
      const rows = parseCSV(String(e.target?.result || ""));
      setSalesData(rows);
      setSalesFile({ name: f.name, meta: (f.size / 1024).toFixed(1) + " KB · " + rows.length + " rows" });
    };
    r.readAsText(f);
  };

  const fetchURL = async (url: string): Promise<string[][]> => {
    if (!url.trim()) return [];
    try {
      const res = await fetch(url);
      const text = await res.text();
      return parseCSV(text);
    } catch {
      toast.error("Could not fetch sheet directly. Please export as CSV and upload instead.");
      return [];
    }
  };

  // step nav
  const goNext = () => {
    if (step === 1) {
      let ok = true;
      if (!wbName.trim()) { setWbErr("Please enter a webinar name"); ok = false; } else setWbErr("");
      if (!wbDate) { setDateErr("Please select a date"); ok = false; } else setDateErr("");
      if (!ok) return;
      setStep(2);
    } else if (step === 2) {
      const named = mbs.filter((m) => m.name.trim());
      if (!named.length) { toast.error("Please add at least one media buyer with a name"); return; }
      const incomplete = named.find((m) => !(m.mode === "url" ? m.url.trim() : m.fileName));
      if (incomplete) { toast.error("Please connect a lead sheet for each media buyer"); return; }
      setStep(3);
    } else if (step === 3) {
      run();
    }
  };
  const goBack = () => { if (step > 1) setStep((s) => (s - 1) as any); };

  const run = async () => {
    setTouchedCalc(true);
    const sheetOk = salesMode === "url" ? salesUrl.trim() : !!salesFile;
    const named = mbs.filter((m) => m.name.trim());
    const allSpend = named.every((m) => parseFloat(m.spend) > 0);
    if (!sheetOk || !allSpend) { toast.error("Please connect sales sheet and enter ad spend for each media buyer"); return; }
    setSavedSessionId(null); setSavedHist(false);

    setCalculating(true);
    setStep(4);
    const labels = ["Reading lead sheets…", "Reading sales data…", "Matching by email…", "Matching by phone…", "Matching by name…", "Calculating ROAS…", "Preparing your results…"];
    let pct = 0, li = 0;
    setProgPct(0); setCalcMsg(labels[0]);
    const iv = setInterval(() => {
      pct += 6 + Math.random() * 10; if (pct > 95) pct = 95;
      setProgPct(pct);
      li = Math.min(li + 1, labels.length - 1);
      setCalcMsg(labels[li]);
    }, 350);

    const mbResolved = await Promise.all(named.map(async (m) => {
      let rows = m.data;
      if (m.mode === "url" && m.url && rows.length === 0) rows = await fetchURL(m.url);
      return { mb: m, rows };
    }));
    let sales = salesData;
    if (salesMode === "url" && salesUrl && sales.length === 0) sales = await fetchURL(salesUrl);

    // Build immutable snapshot for the deterministic engine
    const snapshot: AttributionSnapshot = {
      calculationId: "calc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
      calculationMethod: "manual",
      webinarDetails: { name: wbName, date: wbDate, type: wbType },
      webinarDate: wbDate,
      mediaBuyerOrder: mbResolved.map((x) => `mb-${x.mb.id}`),
      mediaBuyers: mbResolved.map((x) => ({
        id: `mb-${x.mb.id}`,
        name: x.mb.name.toLowerCase().trim(),
        displayName: x.mb.name.trim(),
        sourceType: "manual_upload",
        sourceName: x.mb.fileName || x.mb.url || x.mb.name,
        adSpend: parseFloat(x.mb.spend) || 0,
        sheet: { rows: [...x.rows], columnMapping: null },
      })),
      sales: {
        sourceName: salesFile?.name || salesUrl || "Sales",
        sourceType: "manual_upload",
        sheet: { rows: [...sales], columnMapping: null },
      },
      dealValue: ENGINE_DEAL,
    };
    const er = calculateAttribution(snapshot);
    // eslint-disable-next-line no-console
    console.debug("[ROAS] manual calc", {
      calcId: er.calculationId, inputHash: er.inputSnapshotHash, outputHash: er.outputHash,
      salesRows: er.summary.totalSales, leads: er.summary.totalLeads, order: snapshot.mediaBuyerOrder,
    });
    const legacy = toLegacyPayload(er, { webinarName: wbName, webinarDate: wbDate, webinarType: wbType });
    const tally: AttrRow[] = legacy.rows;
    const salesDetail: SaleDetail[] = legacy.salesDetail;
    const unmatched: Person[] = er.unmatchedSales.map((u) => ({ name: u.buyerName, email: u.buyerEmail, phone: u.buyerPhone }));

    setEngineResult(er);
    if (lastHashes) {
      const same = lastHashes.input === er.inputSnapshotHash;
      setConsistency({
        sameInputSameOutput: same && lastHashes.output === er.outputHash,
        sameInputDifferentOutput: same && lastHashes.output !== er.outputHash,
      });
    }
    setLastHashes({ input: er.inputSnapshotHash, output: er.outputHash });

    setTimeout(() => {
      clearInterval(iv); setProgPct(100);
      setResults({ rows: tally, unmatched, salesDetail, totals: legacy.totals });
      setCalculating(false);
    }, 600);
  };

  const reset = () => {
    setStep(1); setCalculating(false); setResults(null); setProgPct(0);
    setWbName(""); setWbErr(""); setDateErr("");
    setMbs([{ id: 1, name: "", spend: "", leads: "", mode: "url", url: "", data: [] }]);
    idRef.current = 2;
    setSalesData([]); setSalesFile(null); setSalesUrl(""); setSalesMode("url");
    setTouchedCalc(false);
    setEngineResult(null); setSavedSessionId(null); setSavedHist(false);
  };

  // Export handled inside AttributionResultsView

  const saveHistory = async () => {
    if (!results || !userId) return;
    if (savedSessionId) { toast.info("This report has already been saved to history."); return; }
    if (saving) return;
    setSaving(true);
    try {
      const er = engineResult;
      // Duplicate detection
      if (er) {
        const { data: dup } = await supabase
          .from("attribution_sessions")
          .select("id")
          .or(`calculation_id.eq.${er.calculationId},and(input_snapshot_hash.eq.${er.inputSnapshotHash},output_hash.eq.${er.outputHash},created_by.eq.${userId})`)
          .limit(1)
          .maybeSingle();
        if (dup?.id) {
          setSavedSessionId(dup.id); setSavedHist(true);
          toast.info("This report has already been saved to history.");
          return;
        }
      }
      const totals = results.totals;
      const overall = totals.spend > 0 ? totals.revenue / totals.spend : 0;
      const { data: session, error: sessErr } = await supabase
        .from("attribution_sessions")
        .insert({
          webinar_name: wbName || "Untitled",
          webinar_date: wbDate || null,
          webinar_type: wbType,
          total_leads: totals.leads,
          total_sales: totals.sales,
          total_ad_spend: totals.spend,
          total_revenue: totals.revenue,
          overall_roas: overall,
          unmatched_count: results.unmatched.length,
          created_by: userId,
          calculation_method: "manual",
          calculation_display_method: "Manual Upload",
          attribution_engine_version: er?.engineVersion || null,
          calculation_id: er?.calculationId || null,
          input_snapshot_hash: er?.inputSnapshotHash || null,
          output_hash: er?.outputHash || null,
          media_buyer_order: er ? er.mediaBuyerBreakdown.map((b) => ({ id: b.mediaBuyerId, name: b.mediaBuyerName })) : null,
          duplicate_conflicts_count: er?.duplicateLeadConflicts.length || 0,
          result_status: "fresh",
        } as any)
        .select().single();
      if (sessErr || !session) { toast.error("Save failed: " + (sessErr?.message || "")); return; }

      const sid = session.id;
      const buyerRows = results.rows.map((r) => ({
        session_id: sid, media_buyer_name: r.name,
        ad_spend: r.spend, total_leads: r.leads, matched_sales: r.matched, revenue: r.revenue,
        roas_value: r.spend > 0 ? r.revenue / r.spend : 0,
        cpl: r.leads > 0 ? r.spend / r.leads : 0,
        conversion_rate: r.leads > 0 ? (r.matched / r.leads) * 100 : 0,
      }));
      const saleRows = results.salesDetail.map((s, i) => {
        const a = er ? er.auditLog[i] : null;
        return {
          session_id: sid, buyer_name: s.name, email: s.email, phone: s.phone,
          attributed_to: s.attributedTo, match_method: s.matchMethod, revenue: s.revenue,
          webinar_date: s.webinarDate || null,
          sale_id: a?.saleId || null,
          matched_lead_id: a?.matchedLeadId || null,
          matched_lead_name: a?.matchedLeadName || null,
          matched_lead_email: a?.matchedLeadEmail || null,
          matched_lead_phone: a?.matchedLeadPhone || null,
          source_media_buyer: a?.sourceMediaBuyer || null,
          source_row_index: a?.sourceRowIndex ?? null,
          confidence_score: a?.confidenceScore ?? null,
          competing_matches: a ? a.competingMatches as any : null,
          match_reason: a?.matchReason || null,
          needs_review: a?.needsReview || false,
        };
      });
      await supabase.from("attribution_media_buyers").insert(buyerRows);
      if (saleRows.length) await supabase.from("attribution_sales_detail").insert(saleRows);
      if (er) {
        await supabase.from("roas_attribution_audit_logs").insert({
          attribution_session_id: sid,
          calculation_id: er.calculationId,
          input_snapshot_hash: er.inputSnapshotHash,
          output_hash: er.outputHash,
          media_buyer_order: er.mediaBuyerBreakdown.map((b) => ({ id: b.mediaBuyerId, name: b.mediaBuyerName })) as any,
          column_mappings_used: null,
          audit_rows: er.auditLog as any,
          duplicate_conflicts: er.duplicateLeadConflicts as any,
          created_by: userId,
        } as any);
      }
      setSavedSessionId(sid);
      setSavedHist(true);
      toast.success("Attribution saved to history ✓");
    } finally {
      setSaving(false);
    }
  };

  const namedMbs = mbs.filter((m) => m.name.trim());
  const totalSpend = namedMbs.reduce((a, m) => a + (parseFloat(m.spend) || 0), 0);

  const stepLabels = ["Webinar", "Media Buyers", "Sales & Spend", "Results"];

  return (
    <div className={"wiz" + (step === 4 ? " wide" : "")}>
      {/* Progress indicator */}
      <div className="wiz-prog">
        {stepLabels.map((lbl, i) => {
          const n = i + 1;
          const status = step > n ? "done" : step === n ? "active" : "";
          return (
            <React.Fragment key={n}>
              <div className={"wiz-step " + status}>
                <div className="wiz-circle">{step > n ? "✓" : n}</div>
                <div className="wiz-lbl">{lbl}</div>
              </div>
              {i < 3 && <div className={"wiz-line" + (step > n ? " done" : "")} />}
            </React.Fragment>
          );
        })}
      </div>

      <div className="wiz-body" key={step}>
        {/* STEP 1 */}
        {step === 1 && (
          <>
            <div className="wiz-h">Which webinar are we attributing?</div>
            <div className="wiz-sub">Enter the webinar details so results are clearly labelled and saved to history.</div>

            <div style={{ marginBottom: 18 }}>
              <QuickSaveInput
                fieldKey="webinar_name"
                label="Webinar name"
                placeholder="e.g. Learn 6 Secrets to ₹1 Crore Turnover"
                value={wbName}
                onChange={(v) => { setWbName(v); if (wbErr) setWbErr(""); }}
              />
              {wbErr && <div className="err">{wbErr}</div>}
            </div>

            <div style={{ marginBottom: 18 }}>
              <label className="fl">Webinar date</label>
              <input className="fi fi-h" type="date" value={wbDate} onChange={(e) => { setWbDate(e.target.value); if (dateErr) setDateErr(""); }} />
              {dateErr && <div className="err">{dateErr}</div>}
            </div>

            <div>
              <label className="fl">Webinar type</label>
              <div className="wpills">
                {[["1-day", "1 Day"], ["2-day", "2 Days"], ["3-day", "3 Days"], ["series", "Series"]].map(([v, l]) => (
                  <button key={v} className={"wpill" + (wbType === v ? " sel" : "")} onClick={() => setWbType(v)}>{l}</button>
                ))}
              </div>
            </div>

            <div className="wiz-nav">
              <button className="wiz-btn wiz-btn-k" onClick={goNext}>Next →</button>
            </div>
          </>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <>
            <div className="wiz-h">Who are your media buyers?</div>
            <div className="wiz-sub">Add each media buyer and connect the Google Sheet or CSV file where their leads are stored.</div>

            {mbs.map((m, idx) => {
              const ini = initials(m.name);
              const connected = m.mode === "url" ? !!m.url.trim() : !!m.fileName;
              return (
                <div className={"mb-card" + (m.name && !connected ? " warn" : "")} key={m.id}>
                  <div className="mb-card-hd">
                    <div className="mb-av">{ini || "?"}</div>
                    <div>
                      <div className="mb-hd-t">Media Buyer {idx + 1}</div>
                      {m.name && <div className="mb-hd-s">{m.name}</div>}
                    </div>
                    <button className="mb-card-x" onClick={() => removeMB(m.id)} title="Remove">✕</button>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <QuickSaveInput
                      fieldKey="media_buyer_name"
                      label="Media buyer name"
                      placeholder="Full name"
                      value={m.name}
                      onChange={(v) => updateMB(m.id, { name: v })}
                      height={40}
                    />
                  </div>

                  <label className="fl-sm">Lead sheet</label>
                  <div className="row-2">
                    <div className={"src-opt" + (m.mode === "url" ? " sel" : "")} onClick={() => updateMB(m.id, { mode: "url" })}>
                      <div className="src-opt-ic">🔗</div>
                      <div><div className="src-opt-t">Google Sheet</div><div className="src-opt-s">Live fetch via URL</div></div>
                    </div>
                    <div className={"src-opt" + (m.mode === "csv" ? " sel" : "")} onClick={() => updateMB(m.id, { mode: "csv" })}>
                      <div className="src-opt-ic">📄</div>
                      <div><div className="src-opt-t">Upload CSV</div><div className="src-opt-s">Manual upload</div></div>
                    </div>
                  </div>

                  {m.mode === "url" ? (
                    <div style={{ marginTop: 10 }}>
                      <input className="fi-sm" value={m.url} onChange={(e) => updateMB(m.id, { url: e.target.value })} placeholder="Paste published CSV URL…" />
                      <div className="helper">File → Share → Publish to web → CSV format</div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>
                      <UploadZone done={!!m.fileName} fileName={m.fileName} fileMeta={m.fileMeta}
                        onFile={(f) => handleMBFile(m.id, f)} idleIcon="📄" idleTitle="Drop CSV file here or click to browse" idleSub="Any format — auto-detected" />
                    </div>
                  )}

                  {m.name && (
                    connected
                      ? <div className="conn-good">● {m.mode === "url" ? "Sheet connected" : `${m.fileName} uploaded`}</div>
                      : <div className="conn-bad">● No lead sheet connected</div>
                  )}
                </div>
              );
            })}

            <button className="add-mb-btn" onClick={addMB} style={{ height: 52 }}>＋ Add media buyer</button>

            <div className="wiz-nav">
              <button className="wiz-btn wiz-btn-g" onClick={goBack}>← Back</button>
              <button className="wiz-btn wiz-btn-k" onClick={goNext}>Next →</button>
            </div>
          </>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <>
            <div className="wiz-h">Sales data & ad spends</div>
            <div className="wiz-sub">Upload your sales sheet and enter how much each media buyer spent on ads for this webinar.</div>

            <div className="sl">Sales sheet</div>
            <div className="info-box">💡 The system will match sales to leads using email, phone, and name. Works with manually entered data and gaps in rows.</div>
            <div className="sheet-opts">
              <div className={"sheet-opt" + (salesMode === "url" ? " sel" : "")} onClick={() => setSalesMode("url")}>
                <div className="so-icon">🔗</div><div className="so-title">Google Sheet URL</div><div className="so-desc">Fetch live from your sheet</div>
              </div>
              <div className={"sheet-opt" + (salesMode === "csv" ? " sel" : "")} onClick={() => setSalesMode("csv")}>
                <div className="so-icon">📄</div><div className="so-title">Upload CSV</div><div className="so-desc">Export and upload manually</div>
              </div>
            </div>
            {salesMode === "url" ? (
              <div style={{ marginTop: 10 }}>
                <input className="fi" value={salesUrl} onChange={(e) => setSalesUrl(e.target.value)} placeholder="Paste Google Sheet published CSV URL…" />
                <div className="helper">File → Share → Publish to web → CSV format</div>
              </div>
            ) : (
              <UploadZone done={!!salesFile} fileName={salesFile?.name} fileMeta={salesFile?.meta}
                onFile={handleSalesFile} idleIcon="📊" idleTitle="Drop sales sheet CSV here or click to browse" idleSub="Any format — auto-detects name, email, phone columns" />
            )}

            <div style={{ marginTop: 28 }}>
              <div className="sl">Ad spend per media buyer</div>
              {namedMbs.length === 0 && <div style={{ color: "#888", fontSize: 12.5, padding: "10px 0" }}>Add at least one named media buyer in Step 2.</div>}
              {namedMbs.map((m) => {
                const connected = m.mode === "url" ? !!m.url.trim() : !!m.fileName;
                const bad = touchedCalc && !(parseFloat(m.spend) > 0);
                return (
                  <div className="spend-row" key={m.id}>
                    <div className="left">
                      <div className="spend-av">{initials(m.name)}</div>
                      <div>
                        <div className="spend-name">{m.name}</div>
                        <div style={{ fontSize: 10, color: connected ? "#16A34A" : "#CA8A04" }}>{connected ? "Lead sheet connected ●" : "Sheet not connected ●"}</div>
                      </div>
                    </div>
                    <div className="spend-input-wrap">
                      <span className="pfx">₹</span>
                      <input className={"spend-inp" + (bad ? " bad" : "")} type="number" value={m.spend}
                        onChange={(e) => updateMB(m.id, { spend: e.target.value })} placeholder="Amount spent" />
                      {bad && <div className="err" style={{ marginTop: 4 }}>Please enter ad spend</div>}
                    </div>
                  </div>
                );
              })}
              {namedMbs.length > 0 && <div className="spend-tot">Total ad spend: <strong style={{ color: "#0a0a0a" }}>{totalSpend > 0 ? inr(totalSpend) : "—"}</strong></div>}
            </div>

            {namedMbs.length > 0 && (
              <div style={{ marginTop: 24, border: "1px solid #E8E5DE", borderRadius: 12, padding: 16, background: "#FBF6E9" }}>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 500, marginBottom: 4 }}>
                  Media Buyer Priority Order
                </div>
                <div style={{ fontSize: 11.5, color: "#7A5E10", marginBottom: 10, lineHeight: 1.5 }}>
                  When the same lead exists in multiple media buyer sheets, the buyer listed first wins. This order is locked into the snapshot for reproducibility.
                </div>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5 }}>
                  {namedMbs.map((m, i) => (
                    <li key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                      <span style={{ flex: 1 }}><strong>{m.name}</strong></span>
                      <button className="btn btn-g btn-sm" disabled={i === 0}
                        onClick={() => setMbs((p) => {
                          const filtered = p.filter((x) => x.name.trim());
                          const idx = p.findIndex((x) => x.id === m.id);
                          const prevId = filtered[i - 1]?.id;
                          const prevIdx = p.findIndex((x) => x.id === prevId);
                          if (idx < 0 || prevIdx < 0) return p;
                          const next = [...p]; [next[idx], next[prevIdx]] = [next[prevIdx], next[idx]]; return next;
                        })}>↑</button>
                      <button className="btn btn-g btn-sm" disabled={i === namedMbs.length - 1}
                        onClick={() => setMbs((p) => {
                          const filtered = p.filter((x) => x.name.trim());
                          const idx = p.findIndex((x) => x.id === m.id);
                          const nextId = filtered[i + 1]?.id;
                          const nextIdx = p.findIndex((x) => x.id === nextId);
                          if (idx < 0 || nextIdx < 0) return p;
                          const next = [...p]; [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]]; return next;
                        })}>↓</button>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="wiz-nav">
              <button className="wiz-btn wiz-btn-g" onClick={goBack}>← Back</button>
              <button className="wiz-btn wiz-btn-k" onClick={goNext}>Calculate attribution →</button>
            </div>
          </>
        )}

        {/* STEP 4 */}
        {step === 4 && calculating && (
          <div className="calc-wrap">
            <div className="calc-msg">{calcMsg}</div>
            <div className="calc-bar"><div className="calc-bar-fill" style={{ width: progPct + "%" }} /></div>
          </div>
        )}

        {step === 4 && !calculating && results && (
          <>
            <div style={{ border: "1px solid #E8E5DE", borderRadius: 12, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <div><div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: ".08em" }}>Calculation Method</div><div style={{ fontSize: 13, fontWeight: 500, color: "#C8A84B" }}>Manual Upload</div></div>
              <div><div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: ".08em" }}>Webinar</div><div style={{ fontSize: 13 }}>{wbName}</div></div>
              <div><div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: ".08em" }}>Webinar Type</div><div style={{ fontSize: 13 }}>{(wbType || "—").replace("-", " ")}</div></div>
              <div><div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: ".08em" }}>Webinar Date / Period</div><div style={{ fontSize: 13 }}>{wbDate ? fmtDate(wbDate) : "—"}</div></div>
              <div><div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: ".08em" }}>Created On</div><div style={{ fontSize: 13 }}>{new Date().toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div></div>
              <div><div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: ".08em" }}>Ad Spend Source</div><div style={{ fontSize: 13 }}>Manual Entry</div></div>
            </div>
            <AttributionResultsView
              payload={{
                webinarName: wbName, webinarDate: wbDate, webinarType: wbType,
                totals: results.totals, rows: results.rows, salesDetail: results.salesDetail,
                meta: {
                  createdOn: new Date().toLocaleString("en-IN"),
                  calculationMethod: "Manual Upload",
                  webinarPeriod: wbDate ? fmtDate(wbDate) : "",
                  adSpendSource: "Manual Entry",
                  calculationId: engineResult?.calculationId,
                  inputSnapshotHash: engineResult?.inputSnapshotHash,
                  outputHash: engineResult?.outputHash,
                  engineVersion: engineResult?.engineVersion,
                },
              }}
              onSave={saveHistory}
              savedHist={savedHist || !!savedSessionId}
            />
            {engineResult && (
              <AttributionAuditPanel
                result={engineResult}
                mediaBuyerOrder={engineResult.mediaBuyerBreakdown.map((b) => ({
                  id: b.mediaBuyerId, displayName: b.mediaBuyerName,
                  leads: b.leads, source: "manual_upload",
                }))}
                columnMappingsUsed={[
                  { source: "Sales", tabName: salesFile?.name || salesUrl || "Sales", mapping: null },
                  ...namedMbs.map((m) => ({ source: m.name, tabName: m.fileName || m.url || m.name, mapping: null })),
                ]}
                consistency={consistency}
              />
            )}
            <div style={{ textAlign: "center", marginTop: 24, display: "flex", gap: 16, justifyContent: "center" }}>
              <button onClick={reset} style={{ background: "transparent", border: "none", color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "'Jost',sans-serif" }}>← Start a new attribution</button>
              {onBackToMethod && (
                <button onClick={onBackToMethod} style={{ background: "transparent", border: "none", color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "'Jost',sans-serif" }}>← Change method</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SumCard({ kind, label, value, note }: { kind: "gold" | "plain" | "grn"; label: string; value: string; note: string }) {
  return (
    <div className={"sum-card " + kind}>
      <div className="sum-lbl">{label}</div>
      <div className="sum-val">{value}</div>
      <div className="sum-note">{note}</div>
    </div>
  );
}

function UploadZone({ done, fileName, fileMeta, onFile, idleIcon, idleTitle, idleSub }: {
  done: boolean; fileName?: string; fileMeta?: string; onFile: (f: File) => void; idleIcon: string; idleTitle: string; idleSub: string;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div className={"uz-compact" + (drag ? " drag" : "") + (done ? " done" : "")}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
      <input type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      {done ? (
        <div><div className="uz-icon">✅</div><div className="uz-done-name">{fileName}</div><div className="uz-done-meta">{fileMeta}</div></div>
      ) : (
        <div><div className="uz-icon">{idleIcon}</div><div className="uz-title">{idleTitle}</div><div className="uz-sub">{idleSub}</div></div>
      )}
    </div>
  );
}

// ===================================================================
// TAB 2: TOTAL ROAS
// ===================================================================
function TotalTab({ userId }: { userId?: string }) {
  const [spend, setSpend] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"url" | "csv" | "manual">("url");
  const [url, setUrl] = useState("");
  const [salesCount, setSalesCount] = useState("");
  const [revenue, setRevenue] = useState("");
  const [csvFile, setCsvFile] = useState<{ name: string; meta: string } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("roas_history").select("*").order("created_at", { ascending: false }).limit(50);
      setHistory((data || []).map((r: any) => ({
        id: r.id, campaign: r.campaign_name, date: r.created_at,
        spend: Number(r.total_ad_spend), revenue: Number(r.total_revenue || 0),
        sales: Number(r.total_sales || 0), roas: Number(r.roas_value || 0),
      })));
    })();
  }, []);

  const s = parseFloat(spend) || 0;
  const r = parseFloat(revenue) || 0;
  const c = parseFloat(salesCount) || 0;
  const roasN = s > 0 ? r / s : 0;

  const handleCsv = (f: File) => {
    const rd = new FileReader();
    rd.onload = (e) => {
      const rows = parseCSV(String(e.target?.result || ""));
      const valid = rows.slice(1);
      const cnt = valid.length;
      setCsvFile({ name: f.name, meta: (f.size / 1024).toFixed(1) + " KB · " + rows.length + " rows" });
      setSalesCount(String(cnt));
      setRevenue(String(cnt * DEAL_VALUE));
    };
    rd.readAsText(f);
  };
  const fetchSheet = async () => {
    if (!url.trim()) return;
    try {
      const res = await fetch(url); const text = await res.text();
      const rows = parseCSV(text);
      const cnt = Math.max(0, rows.length - 1);
      setSalesCount(String(cnt));
      setRevenue(String(cnt * DEAL_VALUE));
      toast.success("Fetched " + cnt + " sales");
    } catch { toast.error("Could not fetch sheet. Use Upload CSV instead."); }
  };

  const save = async () => {
    if (!s) { toast.error("Please enter ad spend first"); return; }
    if (!userId) return;
    const row = {
      campaign_name: name || "Unnamed campaign",
      webinar_date: new Date().toISOString().slice(0, 10),
      total_ad_spend: s, total_revenue: r, total_sales: c, roas_value: roasN, created_by: userId,
    };
    const { data, error } = await supabase.from("roas_history").insert(row).select().single();
    if (error) { toast.error(error.message); return; }
    setHistory((p) => [{ id: data.id, campaign: row.campaign_name, date: data.created_at, spend: s, revenue: r, sales: c, roas: roasN }, ...p]);
    toast.success("Saved to history ✓");
  };

  return (
    <>
      <div className="page-title">Total ROAS</div>
      <p className="page-sub">Calculate the overall return on ad spend for the entire webinar — all media buyers combined, all revenue against all spend.</p>

      <div className="step-card active">
        <div className="step-header"><div className="step-num">1</div><div><div className="step-title">Ad spend</div><div className="step-sub">Enter the total combined ad spend across all media buyers</div></div></div>
        <div className="two-col">
          <div><label className="fl">Total ad spend (₹)</label><input className="fi" type="number" value={spend} onChange={(e) => setSpend(e.target.value)} placeholder="e.g. 75000" /></div>
          <div><label className="fl">Webinar / campaign name</label><input className="fi" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Day 1 — 5 May 2026" /></div>
        </div>
      </div>

      <div className="step-card">
        <div className="step-header"><div className="step-num">2</div><div><div className="step-title">Sales data</div><div className="step-sub">Connect your sales sheet or enter revenue manually</div></div></div>
        <div className="sheet-opts three" style={{ marginBottom: 14 }}>
          <div className={"sheet-opt" + (mode === "url" ? " sel" : "")} onClick={() => setMode("url")}><div className="so-icon">🔗</div><div className="so-title">Google Sheet URL</div><div className="so-desc">Fetch sales data live from your Google Sheet</div></div>
          <div className={"sheet-opt" + (mode === "csv" ? " sel" : "")} onClick={() => setMode("csv")}><div className="so-icon">📄</div><div className="so-title">Upload CSV</div><div className="so-desc">Upload exported sales sheet CSV</div></div>
          <div className={"sheet-opt" + (mode === "manual" ? " sel" : "")} onClick={() => setMode("manual")}><div className="so-icon">✏️</div><div className="so-title">Enter manually</div><div className="so-desc">Type in total sales count and revenue directly</div></div>
        </div>
        {mode === "url" && (
          <>
            <input className="fi" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste published Google Sheet CSV URL…" />
            <div style={{ fontSize: 11, color: "#888", marginTop: 6, marginBottom: 8 }}>System will count rows and sum revenue column automatically</div>
            <button className="btn btn-g btn-sm" onClick={fetchSheet}>Fetch sheet</button>
          </>
        )}
        {mode === "csv" && (
          <UploadZone done={!!csvFile} fileName={csvFile?.name} fileMeta={csvFile?.meta} onFile={handleCsv}
            idleIcon="📊" idleTitle="Drop sales CSV here" idleSub="Any format" />
        )}
        {mode === "manual" && (
          <div className="two-col" style={{ marginTop: 10 }}>
            <div><label className="fl">Number of sales</label><input className="fi" type="number" value={salesCount} onChange={(e) => setSalesCount(e.target.value)} placeholder="e.g. 22" /></div>
            <div><label className="fl">Total revenue (₹)</label><input className="fi" type="number" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="e.g. 2596000" /></div>
          </div>
        )}
      </div>

      <div className="sum-row" style={{ marginTop: 4 }}>
        <div className="sum-card gold">
          <div className="sum-lbl">ROAS</div>
          <div className={"sum-val " + (s > 0 && r > 0 ? roasClass(roasN) : "")} style={{ color: s > 0 && r > 0 ? undefined : "#C8A84B" }}>{s > 0 && r > 0 ? roasN.toFixed(2) + "×" : "—"}</div>
          <div className="sum-note">{roasN >= 10 ? "Excellent return" : roasN >= 5 ? "Healthy return" : roasN > 0 ? "Below target" : "Updates live as you type"}</div>
        </div>
        <SumCard kind="plain" label="Total revenue" value={r > 0 ? inr(r) : "—"} note="From sales sheet" />
        <SumCard kind="plain" label="Total sales" value={c > 0 ? String(c) : "—"} note="Confirmed conversions" />
        <SumCard kind="plain" label="Cost per acquisition" value={c > 0 && s > 0 ? "₹" + Math.round(s / c).toLocaleString("en-IN") : "—"} note="Ad spend / sales count" />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button className="btn btn-k" onClick={() => { /* live, just refresh */ }}>Calculate</button>
        <button className="btn btn-g" onClick={save}>Save to history</button>
      </div>

      <div style={{ marginTop: 28 }}>
        <div className="sl">Calculation history</div>
        <table className="attr-table">
          <thead><tr><th>Campaign</th><th>Date</th><th>Ad Spend</th><th>Revenue</th><th>Sales</th><th>ROAS</th></tr></thead>
          <tbody>
            {history.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "#888", padding: 24 }}>No calculations yet. Save your first one above.</td></tr>
            )}
            {history.map((h) => (
              <tr key={h.id}>
                <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, fontWeight: 500 }}>{h.campaign}</td>
                <td style={{ fontSize: 12, color: "#888" }}>{fmtDate(h.date)}</td>
                <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15 }}>{inr(h.spend)}</td>
                <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: "#16A34A" }}>{inr(h.revenue)}</td>
                <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15 }}>{h.sales}</td>
                <td><span className={"roas-val " + roasClass(h.roas)}>{h.roas.toFixed(1)}×</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ===================================================================
// TAB 3: DATA SOURCES
// ===================================================================
function SourcesTab({ userId }: { userId?: string }) {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("lead_sheet");
  const [url, setUrl] = useState("");
  const [desc, setDesc] = useState("");

  const load = async () => {
    const { data } = await supabase.from("data_sources").select("*").order("created_at", { ascending: false });
    setSources((data || []).map((d: any) => ({
      id: d.id, name: d.source_name, type: d.source_type, url: d.sheet_url, description: d.description,
      status: d.status, meta: d.last_fetched ? `Last used: ${fmtDate(d.last_fetched)} · ${d.row_count || 0} rows` : "Never used",
    })));
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim() || !url.trim() || !userId) { toast.error("Name and URL are required"); return; }
    const { error } = await supabase.from("data_sources").insert({
      source_name: name, source_type: type, sheet_url: url, description: desc, status: "manual", created_by: userId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Data source added ✓");
    setName(""); setUrl(""); setDesc(""); setType("lead_sheet");
    load();
  };
  const remove = async (id?: string) => {
    if (!id) return;
    const { error } = await supabase.from("data_sources").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setSources((p) => p.filter((s) => s.id !== id));
  };

  return (
    <>
      <div className="page-title">Data Sources</div>
      <p className="page-sub">Manage all connected Google Sheets and data sources used across the ROAS Calculator. Link a sheet once here and reuse it every time you run attribution.</p>

      <div className="sl">Connected sources</div>
      <div style={{ marginBottom: 20 }}>
        {sources.length === 0 && <div style={{ color: "#888", fontSize: 13, padding: "16px 0" }}>No data sources yet. Add your first one below.</div>}
        {sources.map((s) => (
          <div className="ds-card" key={s.id}>
            <div className="ds-icon">{s.type === "sales_sheet" ? "📋" : "📊"}</div>
            <div style={{ flex: 1 }}>
              <div className="ds-name">{s.name}</div>
              <div className="ds-desc">{s.description || "—"}</div>
              <a className="ds-url" href={s.url} target="_blank" rel="noreferrer">🔗 {s.url.length > 60 ? s.url.slice(0, 60) + "…" : s.url}</a>
              <div style={{ marginTop: 7, display: "flex", gap: 7, alignItems: "center" }}>
                <span className={"ds-status " + s.status}>{s.status === "live" ? "● Live sync" : "Manual entry"}</span>
                <span style={{ fontSize: 11, color: "#888" }}>{s.meta}</span>
              </div>
            </div>
            <div className="ds-actions">
              <button className="ds-btn del" onClick={() => remove(s.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      <div className="add-ds-form">
        <div className="add-ds-title">Add new data source</div>
        <div className="two-col" style={{ marginBottom: 12 }}>
          <div><label className="fl">Source name</label><input className="fi" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul Singh — Lead Sheet" /></div>
          <div><label className="fl">Source type</label>
            <select className="fsel" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="lead_sheet">Lead Sheet (media buyer)</option>
              <option value="sales_sheet">Sales Sheet (manual)</option>
              <option value="registration">Registration Sheet</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="fl">Google Sheet URL (published as CSV)</label>
          <input className="fi" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste published CSV URL here…" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="fl">Description</label>
          <input className="fi" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Briefly describe what this sheet contains and which media buyer or team it belongs to…" />
        </div>
        <button className="btn btn-k" onClick={add}>Add data source</button>
      </div>
    </>
  );
}
