import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

// ─────────────────────────────────────────────────────────────────────────
//  Apology & Forgiveness Agreement — cute romantic one-page A4 PDF.
//  NOTE: JSX is intentionally NOT used here (the server tsconfig has no "jsx"
//  compiler option). We build the tree with React.createElement (aliased `h`)
//  so this .tsx file compiles cleanly under the existing config.
//  Fonts: built-in Helvetica only (no remote/Google font registration) so it
//  works on a headless EC2 box with no network access.
// ─────────────────────────────────────────────────────────────────────────

const h = React.createElement;

export interface ApologyPdfInput {
  senderName: string;
  recipientName: string;
  relationship: string;
  sorryLetter: string;
  acceptedPromises: string[];
  signerName: string;
  signatureImage: string; // PNG data URL
  tokenId: string;
  dateStr: string;
}

// Soft rose / pink palette
const ROSE = "#ff5f8a";
const ROSE_DEEP = "#e64072";
const CREAM = "#fff5f5";
const INK = "#3a2233";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffeef2",
    paddingVertical: 34,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    color: INK,
  },
  card: {
    flexGrow: 1,
    backgroundColor: CREAM,
    borderRadius: 22,
    border: `2 solid ${ROSE}`,
    padding: 28,
  },
  headerBand: {
    backgroundColor: ROSE_DEEP,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 18,
    alignItems: "center",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  headerSub: {
    color: "#ffe3ec",
    fontSize: 9,
    marginTop: 5,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  heartRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 14,
  },
  heart: {
    width: 12,
    height: 12,
    backgroundColor: ROSE,
    borderRadius: 6,
    marginHorizontal: 3,
    transform: "rotate(45deg)",
  },
  fromLine: {
    fontSize: 12,
    fontFamily: "Helvetica-Oblique",
    color: ROSE_DEEP,
    textAlign: "center",
    marginBottom: 16,
  },
  fromName: {
    fontFamily: "Helvetica-Bold",
  },
  quotePanel: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderLeft: `4 solid ${ROSE}`,
    padding: 16,
    marginBottom: 18,
  },
  quoteMark: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: ROSE,
    marginBottom: 2,
  },
  quoteText: {
    fontSize: 11.5,
    lineHeight: 1.65,
    color: INK,
  },
  sectionTitle: {
    fontSize: 12.5,
    fontFamily: "Helvetica-Bold",
    color: ROSE_DEEP,
    marginBottom: 8,
  },
  promiseRow: {
    flexDirection: "row",
    marginBottom: 6,
    alignItems: "flex-start",
  },
  promiseBullet: {
    width: 8,
    height: 8,
    backgroundColor: ROSE,
    borderRadius: 4,
    marginTop: 3,
    marginRight: 8,
    transform: "rotate(45deg)",
  },
  promiseText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 1.5,
    color: INK,
  },
  promisesPanel: {
    backgroundColor: "#fff0f4",
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
  },
  signBlock: {
    marginTop: 6,
    borderTop: `1 dashed ${ROSE}`,
    paddingTop: 14,
  },
  signLabel: {
    fontSize: 10.5,
    color: "#8a5c6f",
    marginBottom: 4,
  },
  signName: {
    fontFamily: "Helvetica-Bold",
    color: ROSE_DEEP,
  },
  signatureImage: {
    width: 180,
    height: 70,
    objectFit: "contain",
  },
  footer: {
    marginTop: "auto",
    paddingTop: 14,
    textAlign: "center",
  },
  footerText: {
    fontSize: 8.5,
    color: "#a56f82",
    letterSpacing: 0.4,
  },
});

function Hearts(): React.ReactElement {
  return h(
    View,
    { style: styles.heartRow },
    h(View, { style: styles.heart }),
    h(View, { style: styles.heart }),
    h(View, { style: styles.heart })
  );
}

function ApologyDocument(input: ApologyPdfInput) {
  const promises = (input.acceptedPromises || []).filter(
    (p) => typeof p === "string" && p.trim().length > 0
  );

  const children: React.ReactElement[] = [];

  // Header band
  children.push(
    h(
      View,
      { key: "header", style: styles.headerBand },
      h(
        Text,
        { style: styles.headerTitle },
        "<3  Official Apology & Forgiveness Agreement  <3"
      ),
      h(Text, { style: styles.headerSub }, "A Sweet & Binding Love Voucher")
    )
  );

  children.push(h(Hearts, { key: "hearts" }));

  // From / to line
  children.push(
    h(
      Text,
      { key: "from", style: styles.fromLine },
      "From ",
      h(Text, { style: styles.fromName }, input.senderName),
      ", to my dear ",
      h(Text, { style: styles.fromName }, input.recipientName)
    )
  );

  // Sorry letter quoted panel
  children.push(
    h(
      View,
      { key: "letter", style: styles.quotePanel },
      h(Text, { style: styles.quoteMark }, '"'),
      h(Text, { style: styles.quoteText }, input.sorryLetter)
    )
  );

  // Promises section (skip if empty)
  if (promises.length > 0) {
    children.push(
      h(
        View,
        { key: "promises", style: styles.promisesPanel },
        h(
          Text,
          { style: styles.sectionTitle },
          "Promises I lovingly commit to:"
        ),
        ...promises.map((p, i) =>
          h(
            View,
            { key: `p-${i}`, style: styles.promiseRow },
            h(View, { style: styles.promiseBullet }),
            h(Text, { style: styles.promiseText }, p.trim())
          )
        )
      )
    );
  }

  // Signature block
  children.push(
    h(
      View,
      { key: "sign", style: styles.signBlock },
      h(
        Text,
        { style: styles.signLabel },
        "Signed with love by ",
        h(Text, { style: styles.signName }, input.signerName)
      ),
      input.signatureImage
        ? h(Image, { style: styles.signatureImage, src: input.signatureImage })
        : null
    )
  );

  // Footer
  children.push(
    h(
      View,
      { key: "footer", style: styles.footer },
      h(
        Text,
        { style: styles.footerText },
        `Token: ${input.tokenId}  -  ${input.dateStr}  -  Expires: Never (infinity)  -  made with love <3`
      )
    )
  );

  return h(
    Document,
    null,
    h(Page, { size: "A4", style: styles.page }, h(View, { style: styles.card }, ...children))
  );
}

export async function generateApologyPdf(
  input: ApologyPdfInput
): Promise<Buffer> {
  const element = ApologyDocument(input);
  return await renderToBuffer(element);
}
