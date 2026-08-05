import { Request, Response } from "express";
import TrainTicketPage, {
  IPassenger,
  IFareLine,
  IStation,
} from "../models/TrainTicketPage";
import { checkPublishAccess } from "../services/publishGate.service";

const MAX_PASSENGERS = 4;
const MAX_FARE_LINES = 8;
const MAX_STATIONS = 10;
const MAX_FINE_PRINT = 10;

const STATION_STATUS: IStation["status"][] = ["passed", "current", "upcoming"];
const GENDERS = ["M", "F", "X"];

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

const num = (v: unknown, min: number, max: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const sanitizePassengers = (raw: unknown): IPassenger[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_PASSENGERS)
    .map((p) => {
      const s = (p ?? {}) as Record<string, unknown>;
      const g = str(s.gender, 1).toUpperCase();
      return {
        name: str(s.name, 60),
        age: num(s.age, 0, 150),
        gender: GENDERS.includes(g) ? g : "X",
        bookingStatus: str(s.bookingStatus, 24),
        currentStatus: str(s.currentStatus, 24),
        coach: str(s.coach, 8),
        seat: str(s.seat, 8),
        berth: str(s.berth, 24),
      };
    })
    // A nameless row prints as a blank line on the slip — drop it.
    .filter((p) => p.name.trim().length > 0);
};

const sanitizeFare = (raw: unknown): IFareLine[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_FARE_LINES)
    .map((f) => {
      const s = (f ?? {}) as Record<string, unknown>;
      return { label: str(s.label, 60), value: str(s.value, 60) };
    })
    .filter((f) => f.label.trim().length > 0);
};

const sanitizeStations = (raw: unknown): IStation[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_STATIONS)
    .map((st) => {
      const s = (st ?? {}) as Record<string, unknown>;
      const status = str(s.status, 12) as IStation["status"];
      return {
        name: str(s.name, 60),
        label: str(s.label, 40),
        at: str(s.at, 40),
        detail: str(s.detail, 60),
        status: STATION_STATUS.includes(status) ? status : "upcoming",
      };
    })
    .filter((s) => s.name.trim().length > 0);
};

const sanitizeFinePrint = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_FINE_PRINT)
    .map((l) => str(l, 300))
    .filter((l) => l.trim().length > 0);
};

const sanitizePlace = (raw: unknown): { code: string; name: string } => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return { code: str(s.code, 6).toUpperCase(), name: str(s.name, 40) };
};

const sanitizeDelay = (raw: unknown): { amount: string; reason: string } => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return { amount: str(s.amount, 40), reason: str(s.reason, 120) };
};

/** ISO-ish timestamps only. Anything unparseable becomes "" (= no gate / no countdown). */
const iso = (v: unknown): string => {
  const s = str(v, 40);
  if (!s) return "";
  const t = Date.parse(s);
  return Number.isNaN(t) ? "" : new Date(t).toISOString();
};

/**
 * THE CHART GATE — the security-shaped half of this template.
 *
 * The reveal only works if the recipient genuinely cannot see the outcome before
 * the chart is prepared. Hiding it in the client would leave the names and seat
 * numbers sitting in the network response, so the redaction happens HERE: before
 * `chartPreparedAt` the shared payload carries no passenger row, no seat, no
 * berth and no letter at all. Those bytes never leave the server.
 *
 * `chartPreparedAt === ""` means the chart is already prepared.
 */
const redactUntilChart = (
  data: Record<string, unknown>
): Record<string, unknown> => {
  const at = typeof data.chartPreparedAt === "string" ? data.chartPreparedAt : "";
  const ready = !at || Date.parse(at) <= Date.now();
  if (ready) return { ...data, chartPrepared: true };
  return {
    ...data,
    chartPrepared: false,
    // Only the count survives — the slip needs to know how many rows to promise,
    // and a bare integer discloses nothing.
    passengerCount: Array.isArray(data.passengers) ? data.passengers.length : 0,
    passengers: [],
    letter: "",
  };
};

type TrainTicketBody = {
  pnr?: unknown;
  trainNo?: unknown;
  trainName?: unknown;
  from?: unknown;
  to?: unknown;
  departureAt?: unknown;
  arrivalAt?: unknown;
  chartPreparedAt?: unknown;
  classCode?: unknown;
  quota?: unknown;
  passengers?: unknown;
  fare?: unknown;
  stations?: unknown;
  delay?: unknown;
  finePrint?: unknown;
  letter?: unknown;
  password?: unknown;
};

export const createTrainTicketPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as TrainTicketBody;

    const page = await TrainTicketPage.create({
      userId: req.userId,
      pnr: str(b.pnr, 24),
      trainNo: str(b.trainNo, 12),
      trainName: str(b.trainName, 40),
      from: sanitizePlace(b.from),
      to: sanitizePlace(b.to),
      departureAt: iso(b.departureAt),
      arrivalAt: iso(b.arrivalAt),
      chartPreparedAt: iso(b.chartPreparedAt),
      classCode: str(b.classCode, 8),
      quota: str(b.quota, 16),
      passengers: sanitizePassengers(b.passengers),
      fare: sanitizeFare(b.fare),
      stations: sanitizeStations(b.stations),
      delay: sanitizeDelay(b.delay),
      finePrint: sanitizeFinePrint(b.finePrint),
      letter: str(b.letter, 4000),
      password: str(b.password, 128),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create trainTicket page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyTrainTicketPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await TrainTicketPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my trainTicket pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getTrainTicketPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await TrainTicketPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    // NOTE: no chart redaction here — this is the owner reopening their own draft
    // in the editor, and they wrote the passenger list in the first place.
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get trainTicket page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateTrainTicketPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as TrainTicketBody;

    const page = await TrainTicketPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.pnr             !== undefined) page.pnr             = str(b.pnr, 24);
    if (b.trainNo         !== undefined) page.trainNo         = str(b.trainNo, 12);
    if (b.trainName       !== undefined) page.trainName       = str(b.trainName, 40);
    if (b.from            !== undefined) page.from            = sanitizePlace(b.from);
    if (b.to              !== undefined) page.to              = sanitizePlace(b.to);
    if (b.departureAt     !== undefined) page.departureAt     = iso(b.departureAt);
    if (b.arrivalAt       !== undefined) page.arrivalAt       = iso(b.arrivalAt);
    if (b.chartPreparedAt !== undefined) page.chartPreparedAt = iso(b.chartPreparedAt);
    if (b.classCode       !== undefined) page.classCode       = str(b.classCode, 8);
    if (b.quota           !== undefined) page.quota           = str(b.quota, 16);
    if (b.passengers      !== undefined) page.passengers      = sanitizePassengers(b.passengers);
    if (b.fare            !== undefined) page.fare            = sanitizeFare(b.fare);
    if (b.stations        !== undefined) page.stations        = sanitizeStations(b.stations);
    if (b.delay           !== undefined) page.delay           = sanitizeDelay(b.delay);
    if (b.finePrint       !== undefined) page.finePrint       = sanitizeFinePrint(b.finePrint);
    if (b.letter          !== undefined) page.letter          = str(b.letter, 4000);
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, 128) !== "") page.password = str(b.password, 128);

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update trainTicket page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishTrainTicketPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await TrainTicketPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "train-ticket",
      pageId: String(page._id),
      isAlreadyPublished: !!page.isPublished,
    });

    if (!gate.allowed) {
      res.status(gate.httpStatus).json({ success: false, error: gate.error, pricing: gate.pricing });
      return;
    }

    page.isPublished = true;
    await page.save();

    const { buildShareUrl } = await import("../utils/shareUrl");
    const shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    res.json({ success: true, data: { shareId: page.shareId, shareUrl } });
  } catch (error) {
    console.error("Publish trainTicket page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedTrainTicketPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await TrainTicketPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    // The recipient re-hits this endpoint every time they press GET STATUS, so the
    // gate is re-evaluated on each poll and simply opens once the chart time passes.
    res.json({
      success: true,
      data: redactUntilChart(safeData),
      hasPassword: !!page.password,
      templateType: "train-ticket",
    });
  } catch (error) {
    console.error("Get shared trainTicket page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyTrainTicketPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await TrainTicketPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify trainTicket page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteTrainTicketPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await TrainTicketPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete trainTicket page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
