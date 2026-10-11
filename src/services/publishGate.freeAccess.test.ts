// The publish gate's per-person rules, with the models stubbed (no database):
// super admins publish free unless they pay like a customer, an "All templates
// free" grant frees every priced template, impersonation never borrows the super
// admin's freedom, and a page already paid for keeps reading "already_paid".
// The quote and the order path are asserted to agree with the gate.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import TemplatePricing from "../models/TemplatePricing";
import SeasonSettings from "../models/SeasonSettings";
import PaymentSettings from "../models/PaymentSettings";
import PaymentOrder from "../models/PaymentOrder";
import TemplateGrant from "../models/TemplateGrant";
import User from "../models/User";
import { invalidatePricingCache } from "../config/templatePricing";
import { invalidateGrantCache } from "../config/templateAccess";
import { invalidateEntitlement } from "../config/freeAccess";
import { checkPublishAccess } from "./publishGate.service";
import { quoteFor, viewerFreeReason } from "./pricingQuote.service";
import { createOrder, spendPoints } from "../controllers/payment.controller";

const SUPER = "64b000000000000000000001";
const PLAIN = "64b000000000000000000002";
const INFL = "64b000000000000000000003";
const PAGE = "64b0000000000000000000aa";

type U = { role: string; paysAsCustomer?: boolean; freeAccess?: { enabled: boolean } };
let users: Record<string, U> = {};
let paidPages = new Set<string>();
let chargeOnlyAbroad = false;
let userReadThrows = false;

const q = <T>(v: () => T) => ({ select: () => ({ lean: async () => v() }), lean: async () => v() });
/* eslint-disable @typescript-eslint/no-explicit-any */
(TemplatePricing as any).find = () =>
  q(() => [{ slug: "holi", isFree: false, finalPricePaise: 9900, discountPercent: 0, pointsCost: 50, usdPriceCents: null }]);
(TemplatePricing as any).findOne = (f: { slug: string }) =>
  q(() => (f.slug === "holi" ? { slug: "holi", isFree: false, finalPricePaise: 9900, discountPercent: 0, pointsCost: 50, usdPriceCents: null } : null));
(SeasonSettings as any).findOne = () => q(() => null);
(PaymentSettings as any).findOne = () => q(() => ({ intlPricingEnabled: false, chargeOnlyAbroad, inrPerUsd: 88 }));
(TemplateGrant as any).find = () => q(() => []);
(PaymentOrder as any).findOne = (f: { userId: string; pageId: unknown }) => ({
  select: async () => (paidPages.has(`${f.userId}:${String(f.pageId)}`) ? { _id: "x" } : null),
});
(User as any).findById = (id: string) =>
  q(() => {
    if (userReadThrows) throw new Error("db down");
    return users[String(id)] ?? null;
  });
/* eslint-enable @typescript-eslint/no-explicit-any */

/** A request as `protect` leaves it. Impersonation sets impersonatorId and resolves userId to the target. */
const req = (userId: string, extra: Partial<Request> = {}) =>
  ({
    userId,
    userRole: users[userId]?.role,
    get: () => undefined,
    headers: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    ...extra,
  }) as unknown as Request;

const gate = (userId: string, r = req(userId)) =>
  checkPublishAccess({ req: r, userId, templateType: "holi", pageId: PAGE, isAlreadyPublished: false });

function fakeRes() {
  const out = { status: 200, body: undefined as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = {
    status(c: number) { out.status = c; return res; },
    json(b: unknown) { out.body = b; return res; },
    set() { return res; },
  };
  return { out, res: res as unknown as Response };
}

beforeEach(() => {
  users = {
    [SUPER]: { role: "superadmin" },
    [PLAIN]: { role: "normal" },
    [INFL]: { role: "normal", freeAccess: { enabled: true } },
  };
  paidPages = new Set();
  chargeOnlyAbroad = false;
  userReadThrows = false;
  invalidatePricingCache();
  invalidateGrantCache();
  invalidateEntitlement();
});

test("a plain user meets the paywall", async () => {
  const g = await gate(PLAIN);
  assert.equal(g.allowed, false);
  if (!g.allowed) assert.equal(g.httpStatus, 402);
});

test("a super admin publishes free by default (pays like a customer is off)", async () => {
  const g = await gate(SUPER);
  assert.deepEqual([g.allowed, g.allowed && g.reason], [true, "super_admin"]);
});

test("a super admin who switched on 'Pay like a customer' meets the paywall", async () => {
  users[SUPER].paysAsCustomer = true;
  const g = await gate(SUPER);
  assert.equal(g.allowed, false);
  if (!g.allowed) assert.equal(g.httpStatus, 402);
});

test("'All templates free' frees every priced template", async () => {
  const g = await gate(INFL);
  assert.deepEqual([g.allowed, g.allowed && g.reason], [true, "free_access"]);
});

test("revoked free access meets the paywall again", async () => {
  users[INFL].freeAccess = { enabled: false };
  const g = await gate(INFL);
  assert.equal(g.allowed, false);
});

test("free access on a role that is not super admin ignores paysAsCustomer", async () => {
  users[INFL].paysAsCustomer = true;
  const g = await gate(INFL);
  assert.deepEqual([g.allowed, g.allowed && g.reason], [true, "free_access"]);
});

test("a super admin impersonating a plain user does not make that user free", async () => {
  const r = req(PLAIN, { impersonatorId: SUPER } as Partial<Request>);
  const g = await gate(PLAIN, r);
  assert.equal(g.allowed, false);
  assert.equal(await viewerFreeReason(r), null);
  assert.equal((await quoteFor(r, "holi")).freeForViewer, false);
});

test("a super admin impersonating a free-access user sees that user's freedom, not their own", async () => {
  const g = await gate(INFL, req(INFL, { impersonatorId: SUPER } as Partial<Request>));
  assert.deepEqual([g.allowed, g.allowed && g.reason], [true, "free_access"]);
});

test("a page already paid for still reads already_paid for a free user", async () => {
  paidPages.add(`${INFL}:${PAGE}`);
  paidPages.add(`${SUPER}:${PAGE}`);
  for (const id of [INFL, SUPER]) {
    const g = await gate(id);
    assert.deepEqual([g.allowed, g.allowed && g.reason], [true, "already_paid"]);
  }
});

test("the person outranks India in the reason, both stay free", async () => {
  chargeOnlyAbroad = true;
  // No trusted geo header in this test request, so the country is unknown and
  // an unknown country pays — the plain user still meets the paywall.
  assert.equal((await gate(PLAIN)).allowed, false);
  const g = await gate(SUPER);
  assert.deepEqual([g.allowed, g.allowed && g.reason], [true, "super_admin"]);
});

test("a failed user read fails closed to the paywall", async () => {
  userReadThrows = true;
  const g = await gate(INFL);
  assert.equal(g.allowed, false);
});

test("the quote agrees with the gate for each person", async () => {
  const expect: Array<[string, string | null]> = [[PLAIN, null], [SUPER, "super_admin"], [INFL, "free_access"]];
  for (const [id, reason] of expect) {
    const quote = await quoteFor(req(id), "holi");
    assert.equal(quote.freeReason, reason, id);
    assert.equal(quote.freeForViewer, reason !== null, id);
  }
  users[SUPER].paysAsCustomer = true;
  invalidateEntitlement(SUPER);
  assert.equal((await quoteFor(req(SUPER), "holi")).freeForViewer, false);
});

test("create-order refuses with NO_PAYMENT_NEEDED for a free person, before touching Razorpay", async () => {
  for (const [id, reason] of [[SUPER, "super_admin"], [INFL, "free_access"]] as const) {
    const { out, res } = fakeRes();
    await createOrder(req(id, { body: { templateType: "holi", pageId: PAGE } } as Partial<Request>), res);
    assert.equal(out.status, 400, id);
    assert.equal(out.body.code, "NO_PAYMENT_NEEDED");
    assert.equal(out.body.reason, reason);
  }
});

test("spend-points refuses with NO_PAYMENT_NEEDED for a free person, so no balance is taken", async () => {
  const { out, res } = fakeRes();
  await spendPoints(req(INFL, { body: { templateType: "holi", pageId: PAGE } } as Partial<Request>), res);
  assert.equal(out.status, 400);
  assert.equal(out.body.code, "NO_PAYMENT_NEEDED");
  assert.equal(out.body.reason, "free_access");
});
