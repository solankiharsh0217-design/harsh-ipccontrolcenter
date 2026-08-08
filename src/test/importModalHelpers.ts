/**
 * TEST SUPPORT ONLY — this file is never imported by production code.
 *
 * The pure helpers inside src/components/ImportLeadsModal.tsx (normHeader,
 * detectGstMode, grossUpToInclusive, FIELD_ALIASES, autoMap, parseAmountDetailed,
 * parseAmount) are module-private. Rather than modify the production file to add
 * `export` keywords, this loader reads the REAL source, slices the helper region
 * verbatim, transpiles it and evaluates it. The tests therefore run the exact
 * shipped code — if the source changes, the tests see the change.
 */
import fs from "node:fs";
import path from "node:path";
import { transform } from "sucrase";

export const MODAL_PATH = path.resolve(__dirname, "../components/ImportLeadsModal.tsx");
export const MODAL_SOURCE = fs.readFileSync(MODAL_PATH, "utf8");

const START = "// Normalize a header string for alias matching";
const END = "const parseAmount = (v: any): number => parseAmountDetailed(v).value;";

function sliceHelpers(): string {
  const a = MODAL_SOURCE.indexOf(START);
  const b = MODAL_SOURCE.indexOf(END);
  if (a < 0 || b < 0) {
    throw new Error(
      "ImportLeadsModal helper region markers not found — update src/test/importModalHelpers.ts",
    );
  }
  return MODAL_SOURCE.slice(a, b + END.length);
}

export type GstMode = "exclusive" | "inclusive" | "unknown";

export interface ModalHelpers {
  normHeader: (h: string) => string;
  detectGstMode: (rawHeader: string) => GstMode;
  grossUpToInclusive: (value: number, ratePercent: number) => number;
  autoMap: (headers: string[]) => Record<string, string>;
  parseAmountDetailed: (v: any) => { value: number; ambiguous: boolean; raw: string };
  parseAmount: (v: any) => number;
}

let cached: ModalHelpers | null = null;

export function loadModalHelpers(): ModalHelpers {
  if (cached) return cached;
  const ts = `type FieldKey = string;\n${sliceHelpers()}`;
  const js = transform(ts, { transforms: ["typescript"] }).code;
  const factory = `${js}\nreturn { normHeader, detectGstMode, grossUpToInclusive, autoMap, parseAmountDetailed, parseAmount };`;
  // eslint-disable-next-line no-new-func
  cached = new Function(factory)() as ModalHelpers;
  return cached;
}
