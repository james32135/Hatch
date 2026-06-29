import { config } from "dotenv";
config({ path: ".env" });

const a = process.env.SoSoValue_API_key || "";
const b = process.env.SOSO_API_KEY || "";
console.log(
  JSON.stringify({
    aliasLen: a.length,
    sosoLen: b.length,
    same: a === b,
    aliasPrefix: a.slice(0, 4),
    sosoPrefix: b.slice(0, 4),
    hasWhitespace: /\s/.test(a) || /\s/.test(b),
  }),
);

const key = (b || a).trim();
const res = await fetch("https://openapi.sosovalue.com/openapi/v1/indices", {
  headers: { "x-soso-api-key": key, accept: "application/json" },
});
const text = await res.text();
console.log("status", res.status, text.slice(0, 200));
