// ===== classification.js — smart-ish file classification from names =====

const RULES = [
  { match: /photo|pic|profile|passport|portrait|headshot|photo_|photo\(/, label: "Photograph" },
  { match: /sign(ature)?|sig(na)?/i, label: "Signature" },
  { match: /aadhar|aadhaar|voter|pan|voterid|driving|license|licence|ageproof|id[_ -]?card|identity/i, label: "ID Document" },
  { match: /10(th|std|th_)?|ssc|matric|class[_ -]?10|10th/i, label: "10th Certificate" },
  { match: /12(th|std|th_)?|hsc|inter|class[_ -]?12|12th/i, label: "12th Certificate" },
  { match: /marksheet|mark[_ -]?sheet|marks/i, label: "Marksheet" },
  { match: /degree|diploma|semester|transcript|college|university/i, label: "Educational Document" },
  { match: /certificat|cert/i, label: "Certificate" },
  { match: /caste|category|ews|income|domicile|residence/i, label: "Socio-Economic Proof" },
  { match: /bank|photosheet/i, label: "Bank Document" },
  { match: /letter|form|declaration|affidavit/i, label: "Form" },
  { match: /resume|cv[_ ]?/i, label: "Resume" },
  { match: /scan|img_|image_|dsc_?/i, label: "Scanned Document" },
];

export function classifyFromName(name) {
  if (!name) return "Document";
  for (const rule of RULES) {
    if (rule.match.test(name)) return rule.label;
  }
  return "Document";
}

export function categoryIcon(category) {
  const map = {
    Photograph: "🖼️",
    Signature: "✍️",
    "ID Document": "🪪",
    Certificate: "📜",
    "10th Certificate": "📜",
    "12th Certificate": "📜",
    Marksheet: "📊",
    "Educational Document": "🎓",
    "Socio-Economic Proof": "📑",
    "Bank Document": "🏦",
    Form: "📝",
    Resume: "💼",
    "Scanned Document": "📄",
  };
  return map[category] || "📄";
}