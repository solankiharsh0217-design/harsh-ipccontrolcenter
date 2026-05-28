// INR amount to words
const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ones[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return tens[t] + (o ? " " + ones[o] : "");
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let s = "";
  if (h) s += ones[h] + " Hundred";
  if (r) s += (s ? " " : "") + twoDigits(r);
  return s;
}

export function amountToWordsINR(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);

  if (rupees === 0 && paise === 0) return "Rupees Zero Only";

  let r = rupees;
  const parts: string[] = [];
  const crore = Math.floor(r / 10000000); r = r % 10000000;
  const lakh = Math.floor(r / 100000); r = r % 100000;
  const thousand = Math.floor(r / 1000); r = r % 1000;
  const hundred = r;

  if (crore) parts.push(twoDigits(crore) + " Crore");
  if (lakh) parts.push(twoDigits(lakh) + " Lakh");
  if (thousand) parts.push(twoDigits(thousand) + " Thousand");
  if (hundred) parts.push(threeDigits(hundred));

  let words = "Rupees " + (parts.join(" ") || "Zero");
  if (paise) words += " and " + twoDigits(paise) + " Paise";
  return words + " Only";
}
