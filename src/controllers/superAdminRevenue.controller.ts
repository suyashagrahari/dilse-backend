import { Request, Response } from "express";
import { audit } from "../services/adminAudit";
import { loadTarget } from "./superAdmin.controller";
import { RangeInputError } from "../services/revenueMath";
import { revenueCustomers, revenueOrders, revenueSummary, userBilling } from "../services/revenue.service";
import { composeThanks, previewStatement, sendStatement, StatementError, withDataUrls } from "../services/billingStatement.service";
import { BillingAiRefusedError, BillingAiUnavailableError } from "../services/billingThanksAi.service";
import { sendSesEmail, sesConfigured } from "../services/ses.service";
import {
  checkClosureRequest,
  closeAccount,
  closurePreview,
  ClosureError,
} from "../services/accountClosure.service";

/**
 * Revenue, billing statements and account closure — the super admin's view of
 * who paid what, and the two actions that follow from it.
 *
 * Mounted under /api/admin/super behind `protect` + `requireSuperAdmin` (see
 * routes/superAdminRevenue.routes.ts), so no handler re-checks the role.
 *
 * Reads of the aggregate reports are not audited — they are numbers, not one
 * person's records. Opening ONE user's billing is (`user.view_billing`), as is
 * every statement sent and every closure, each BEFORE success is reported.
 *
 * All money is reported in minor units: INR paise for every `*InrPaise` field,
 * and the order's own currency (paise / cents) for `amount`, `listAmount`,
 * `discountAmount`. Days are IST calendar days.
 */

function badInput(res: Response, error: unknown): boolean {
  if (error instanceof RangeInputError || error instanceof RangeError) {
    res.status(400).json({ success: false, error: error.message });
    return true;
  }
  if (error instanceof StatementError || error instanceof ClosureError) {
    res.status(error.status).json({ success: false, error: error.message });
    return true;
  }
  return false;
}

// ─── REPORTS ────────────────────────────────────────────────────────────────

/** GET /revenue/summary?range=today|7d|30d|90d|custom&from=&to= */
export const getRevenueSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: await revenueSummary(req.query as Record<string, unknown>) });
  } catch (error) {
    if (badInput(res, error)) return;
    console.error("Revenue summary error:", error);
    res.status(500).json({ success: false, error: "Failed to load revenue" });
  }
};

/** GET /revenue/customers?range=&q=&sort=revenue|recent|orders&page=&limit= */
export const getRevenueCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: await revenueCustomers(req.query as Record<string, unknown>) });
  } catch (error) {
    if (badInput(res, error)) return;
    console.error("Revenue customers error:", error);
    res.status(500).json({ success: false, error: "Failed to load paying users" });
  }
};

/** GET /revenue/orders?range=&userId=&status=paid|points_used|failed|created|all&page=&limit= */
export const getRevenueOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: await revenueOrders(req.query as Record<string, unknown>) });
  } catch (error) {
    if (badInput(res, error)) return;
    console.error("Revenue orders error:", error);
    res.status(500).json({ success: false, error: "Failed to load transactions" });
  }
};

// ─── ONE USER ───────────────────────────────────────────────────────────────

/** GET /users/:userId/billing — the drill-down. Audited: it is one person's payment history. */
export const getUserBilling = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadTarget(req, res, { mutating: false });
    if (!user) return;
    const data = await userBilling(String(user._id));
    if (!data) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    await audit(req, {
      action: "user.view_billing",
      targetUserId: String(user._id),
      targetUserEmail: user.email,
    });
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data });
  } catch (error) {
    console.error("User billing error:", error);
    res.status(500).json({ success: false, error: "Failed to load billing" });
  }
};

/**
 * POST /users/:userId/billing/preview — the exact email Send would produce.
 * Writes nothing: no invoice numbers are taken (they read "pending").
 */
export const previewBillingStatement = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadTarget(req, res, { mutating: false });
    if (!user) return;
    const p = await previewStatement(
      { _id: user._id, name: user.name, email: user.email, status: user.status },
      req.body
    );
    res.json({
      success: true,
      data: {
        subject: p.subject,
        // The animated cards travel as cid: parts; a browser needs data: URLs.
        html: withDataUrls(p.html),
        text: p.text,
        message: p.message,
        pdfBase64: p.pdf.toString("base64"),
        pdfFileName: p.pdfFileName,
        orderCount: p.orderCount,
        totalInrPaise: p.totalInrPaise,
        to: p.to,
        // Additive: what the client may want to show next to the preview.
        period: p.period,
        orderIds: p.orderIds,
        currencyTotals: p.currencyTotals,
        pointsUnlocks: p.pointsUnlocks,
        pointsSpent: p.pointsSpent,
        sesConfigured: sesConfigured(),
      },
    });
  } catch (error) {
    if (badInput(res, error)) return;
    console.error("Billing preview error:", error);
    res.status(500).json({ success: false, error: "Failed to build the statement" });
  }
};

/**
 * POST /users/:userId/billing/compose — an AI-written subject and thank-you
 * message for the selected orders (body: the preview body, plus `previous` on
 * Regenerate). Sends and saves nothing; the admin edits it, then previews.
 */
export const composeBillingThanks = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadTarget(req, res, { mutating: false });
    if (!user) return;
    const draft = await composeThanks({ _id: user._id, name: user.name, email: user.email, status: user.status }, req.body);
    res.json({ success: true, data: draft });
  } catch (error) {
    if (badInput(res, error)) return;
    if (error instanceof BillingAiRefusedError) {
      res.status(422).json({ success: false, error: error.message });
      return;
    }
    if (error instanceof BillingAiUnavailableError) {
      res.status(503).json({ success: false, error: error.message });
      return;
    }
    console.error("Billing compose error:", error);
    res.status(500).json({ success: false, error: "Failed to write the message" });
  }
};

/**
 * POST /users/:userId/billing/send — `{ ...preview body, confirm: true }`.
 *
 * Manual, one user, to that user's own address only. The response says what
 * really happened: "sent" (SES accepted it), "skipped" (SES is not configured
 * here — nothing went out), or "failed" (502, with SES's reason).
 */
export const sendBillingStatement = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadTarget(req, res, { mutating: false });
    if (!user) return;
    const result = await sendStatement(
      { _id: user._id, name: user.name, email: user.email, status: user.status },
      req.body,
      { id: String(req.userId), email: req.userEmail || "" },
      { send: sendSesEmail, configured: sesConfigured }
    );

    await audit(req, {
      action: "billing.send_statement",
      targetUserId: String(user._id),
      targetUserEmail: user.email,
      changes: {
        statement: {
          from: null,
          to: {
            status: result.status,
            period: result.statement.period,
            orderCount: result.orderCount,
            totalInrPaise: result.totalInrPaise,
            invoiceNumbers: result.invoiceNumbers,
            messageId: result.statement.messageId,
          },
        },
      },
      reason: result.error ?? undefined,
    });

    const body = { success: result.status !== "failed", message: result.message, data: result };
    if (result.status === "failed") {
      res.status(502).json({ ...body, error: result.message });
      return;
    }
    res.json(body);
  } catch (error) {
    if (badInput(res, error)) return;
    console.error("Billing send error:", error);
    res.status(500).json({ success: false, error: "Failed to send the statement" });
  }
};

// ─── ACCOUNT CLOSURE ────────────────────────────────────────────────────────

/** GET /users/:userId/close/preview — counts for the confirmation dialog. */
export const getClosePreview = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadTarget(req, res, { mutating: true });
    if (!user) return;
    res.json({ success: true, data: await closurePreview(user) });
  } catch (error) {
    console.error("Close preview error:", error);
    res.status(500).json({ success: false, error: "Failed to load the closure preview" });
  }
};

/**
 * POST /users/:userId/close — `{ mode: "hide" | "delete", reason, confirmEmail }`.
 *
 * Done on the user's own request. `loadTarget({ mutating: true })` refuses the
 * super admin account. The audit entry carries the mode and, for "delete", the
 * number of documents removed from each collection.
 */
export const closeUserAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadTarget(req, res, { mutating: true });
    if (!user) return;
    const request = checkClosureRequest(req.body, user.closedEmail || user.email);
    const beforeStatus = user.status || "active";
    const email = user.closedEmail || user.email;

    const result = await closeAccount(user, request, String(req.userId));

    await audit(req, {
      action: "user.close",
      targetUserId: String(user._id),
      // The address as it was — after a "delete" the document no longer has it,
      // and the audit log is where "whose account was this" must stay answerable.
      targetUserEmail: email,
      changes: {
        status: { from: beforeStatus, to: "closed" },
        closureMode: { from: null, to: request.mode },
        deleted: { from: null, to: result.deleted },
        hiddenShareLinks: { from: null, to: result.hiddenShareLinks },
      },
      reason: request.reason,
    });

    res.json({
      success: true,
      data: result,
      message:
        request.mode === "hide"
          ? "Account closed. Its pages are hidden and the person is signed out; if they sign in again they start a new, empty account. Reinstating restores everything."
          : "Account closed and its pages deleted. Payment records were kept.",
    });
  } catch (error) {
    if (badInput(res, error)) return;
    console.error("Close account error:", error);
    res.status(500).json({ success: false, error: "Failed to close the account" });
  }
};
