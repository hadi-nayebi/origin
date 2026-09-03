import fs from "node:fs";

export function renderVoice(file, id, inserts = {}) {
  const source = fs.readFileSync(file, "utf8");
  const voices = new Map();
  for (const match of source.matchAll(
    /<voice id="([a-z0-9.-]+)">\s*<body>([\s\S]*?)<\/body>\s*<\/voice>/g,
  ))
    voices.set(match[1], decode(match[2].trim()));
  const template = voices.get(id);
  if (!template) throw new Error(`Voice ${id} is missing.`);
  const rendered = template.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (_whole, key) => {
    if (!(key in inserts)) throw new Error(`Voice ${id} is missing insert ${key}.`);
    return safeInsert(inserts[key]);
  });
  if (/\{\{/.test(rendered) || rendered.length > 2000)
    throw new Error(`Voice ${id} did not render safely.`);
  return rendered;
}

function safeInsert(value) {
  const text = String(value ?? "none");
  if (text.length > 500 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(text))
    throw new Error("Voice insert is invalid.");
  return text;
}
function decode(value) {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}
