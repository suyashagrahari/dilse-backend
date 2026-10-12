// ── The registered business, as the website prints it ────────────────────────
//
// Mirrors client/lib/business.ts, which every legal page, Contact Us and the
// footer read — and which Razorpay checks against the merchant's KYC. Mail the
// server sends on the business's behalf (billing statements) must name the same
// trader at the same address, so these values are copied verbatim. Change them
// only together with the client file and the Razorpay account.

export const BUSINESS = {
  name: "SubhSandesh",
  proprietor: "Suyash Agrahari",
  type: "Sole Proprietorship",
  addressLines: [
    "Ward No. 06, Indira Nagar, Dumariyaganj",
    "Siddharth Nagar, Uttar Pradesh 272189",
    "India",
  ],
  phoneDisplay: "+91 89570 89392",
  email: "support@subhsandesh.in",
  website: "https://subhsandesh.in",
} as const;
