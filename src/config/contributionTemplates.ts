import mongoose from "mongoose";
import ProductPage from "../models/ProductPage";
import WatchPage from "../models/WatchPage";
import CallPage from "../models/CallPage";

/**
 * SINGLE SOURCE OF TRUTH for which templates accept contributions.
 *
 * A contribution arrives addressed only by `shareId` — the friend following the
 * link has no idea which collection the page lives in. This registry is how the
 * contribution controller turns that `shareId` into a page, and the page into an
 * `ownerId`, without the contribution code ever importing a template model
 * directly or knowing what a "review" is as opposed to a "tag".
 *
 * Adding a template to the contribution system = one new entry here. Nothing in
 * the model, controller, or routes needs to change.
 */

/**
 * The only shape a page document has to have to be contributable: an id, and an
 * owner. Every page model in this repo names its owner `userId`, so that name is
 * baked in rather than made configurable — one convention, held to.
 *
 * `userId` is optional here because a lean read of a legacy document could be
 * missing it. The controller treats a page with no owner as unresolvable rather
 * than writing a contribution nobody can moderate.
 */
export interface ContributablePage {
  _id: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  /**
   * The recipient's link. Contributions are stored against it so the published
   * page can read its own back, but a friend is never addressed by it.
   */
  shareId?: string;
  /**
   * The friends' link, and a DIFFERENT secret from `shareId` on purpose.
   *
   * `shareId` is a read capability handed to the one person the page is for.
   * `contribToken` is a write capability handed to a group chat. Conflating them
   * would mean anyone who can write can also read the gift, and that the sender
   * could never stop collecting reviews without also breaking the recipient's
   * link — one of those is a privacy question and the other is a moderation
   * question, and they should not share a kill switch.
   */
  contribToken?: string;
}

/** How a page is addressed. Exactly one of these is set. */
export type PageFilter = { shareId: string } | { contribToken: string };

/**
 * The slice of a Mongoose model this registry actually calls.
 *
 * Structural, not `Model<ContributablePage>`, and that is load-bearing:
 * `Model<T>` is invariant in TypeScript, so `Model<IProductPage>` is NOT
 * assignable to `Model<ContributablePage>` and every entry below would need a
 * cast. Describing only the three calls we make keeps every registration a
 * plain one-liner with no `as` in sight.
 */
export interface ContributablePageModel {
  findOne(filter: PageFilter): {
    select(fields: string): {
      lean(): PromiseLike<ContributablePage | null>;
    };
  };
}

export interface ContributionPageSource {
  /** Stored verbatim on every contribution as `pageType`. */
  pageType: string;
  model: ContributablePageModel;
}

/**
 * The registry.
 *
 * To register a template: import its model at the top of this file and add
 * exactly one line here. `pageType` is the template slug; the model needs a
 * `shareId` field and a `userId` owner field, and nothing else.
 *
 * `recharge` is deliberately absent. It is the one template in this batch with
 * no contributor loop — the joke is a plan grid and a payment flow, and there is
 * nothing for a friend to add. Registering it would open an anonymous write
 * endpoint against a page that will never read from it.
 */
export const CONTRIBUTION_PAGE_SOURCES: ContributionPageSource[] = [
  { pageType: "product", model: ProductPage },
  { pageType: "watch", model: WatchPage },
  { pageType: "call", model: CallPage },
];

/** The registered source for a template slug, or undefined if it takes no contributions. */
export function getPageSource(pageType: string): ContributionPageSource | undefined {
  return CONTRIBUTION_PAGE_SOURCES.find((source) => source.pageType === pageType);
}

/**
 * Every registered source, for the shareId sweep.
 *
 * Read-only on purpose: the registry is configuration, and a caller that could
 * push onto it would be defining templates at runtime.
 */
export function listPageSources(): readonly ContributionPageSource[] {
  return CONTRIBUTION_PAGE_SOURCES;
}
