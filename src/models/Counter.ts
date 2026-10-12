import mongoose, { Schema } from "mongoose";

/**
 * Named, monotonically increasing sequences.
 *
 * One document per sequence (`_id` is its name, e.g. "invoice"), advanced with
 * `findOneAndUpdate({ _id }, { $inc: { seq: 1 } }, { upsert: true, new: true })`.
 * That single operation is atomic on one document, so two concurrent callers
 * can never be handed the same number — no transaction, no replica set needed.
 * A number taken and then not used (the write that would carry it failed) is a
 * gap, never a duplicate, which is the right way round for invoice numbers.
 */
export interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const Counter = mongoose.model<ICounter>("Counter", counterSchema);

/** The next value of a named sequence, starting at 1. */
export async function nextSequence(name: string): Promise<number> {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return doc!.seq;
}

export default Counter;
