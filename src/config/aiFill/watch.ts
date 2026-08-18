import type { AiFillTemplateSchema } from "./types";

/**
 * watch — "us.", a video watch page for a relationship.
 *
 * Paths resolve against `WatchData` in
 * client/app/(templates)/watch/components/types.ts, held as `mf` in
 * useWatchEditor.ts.
 *
 * `video.youtubeId` is absent on purpose. It is the one field the sender must
 * supply themselves — the model has no way to know which song is theirs, and a
 * plausible-looking invented video id resolves to somebody else's video playing
 * on a page addressed to their girlfriend. `channel.avatarUrl`,
 * `related[].thumbnailUrl` and the comment list are media or contributed
 * content and are absent for the same reasons as elsewhere.
 */
export const watch: AiFillTemplateSchema = {
  slug: "watch",
  audience: "partner",
  premise:
    "A parody video watch page where the video is the couple's song and the page around it is their relationship: channel row, like bar, an expandable description whose chapter timestamps really seek the player, and a sidebar of 'related videos' that are other moments together. The chrome is played completely straight; the comedy is in the metadata. The description's chapter list is the centrepiece — it reads as a tracklist of a relationship — and the outro beneath it is where the joking stops.",
  forbiddenOutput: ["YouTube", "YT", "Shorts", "Google", "Vevo"],
  fields: [
    {
      path: "video.title",
      label: "Video title",
      kind: "text",
      max: 100,
      required: true,
      guide:
        "The title under the player, 20px bold, wrapping to at most two lines. Written the way someone titles a personal upload, not the way a brand does: lowercase is fine, a parenthetical is good, no clickbait and no emoji spam. Under 70 characters reads best.",
      example: "us — the full thing (unedited)",
    },
    {
      path: "video.views",
      label: "View count",
      kind: "text",
      max: 20,
      guide:
        "Rendered as a plain string next to the date — never parsed as a number, so Indian digit grouping is correct and expected. A large absurd number is the joke; keep it formatted like a real count.",
      example: "8,47,000",
    },
    {
      path: "video.postedAgo",
      label: "Posted",
      kind: "text",
      max: 30,
      guide:
        "Relative age of the 'upload', which should line up with how long they have actually been together. Lowercase, no date.",
      example: "2 years ago",
    },
    {
      path: "video.likes",
      label: "Like count",
      kind: "text",
      max: 12,
      guide:
        "The number on the like button, abbreviated the way a real counter abbreviates. String, never parsed.",
      example: "12K",
    },
    {
      path: "channel.name",
      label: "Channel name",
      kind: "text",
      max: 40,
      required: true,
      guide: "The sender's name, or the name he posts under. Short — it sits beside a 40px avatar.",
      example: "Karan",
    },
    {
      path: "channel.handle",
      label: "Channel handle",
      kind: "text",
      max: 30,
      guide: "An @handle for the sender. Lowercase, no spaces, starts with @.",
      example: "@karan",
    },
    {
      path: "channel.subscribers",
      label: "Subscriber count",
      kind: "text",
      max: 30,
      guide:
        "The line under the channel name. '1 subscriber' is the canonical joke and is very hard to improve on — the whole channel has exactly one viewer and it is her. Keep the real counter phrasing.",
      example: "1 subscriber",
    },
    {
      path: "description.intro",
      label: "Description — opening",
      kind: "list",
      max: 3,
      itemMax: 220,
      required: true,
      guide:
        "The paragraphs above the chapter list, shown collapsed until the reader taps 'more'. 1 to 3 short paragraphs in the voice of someone writing an upload description: casual, slightly self-deprecating, not yet sincere. This is the setup, so keep the real feeling out of it — that is what the outro is for.",
      example: "recorded over about two years. no edits, mostly because I don't know how.",
    },
    {
      path: "description.chapters",
      label: "Chapter timestamps",
      kind: "list",
      max: 8,
      itemMax: 90,
      required: true,
      guide:
        "THE CENTREPIECE — these become tappable timestamps that really seek the player. Give 5 to 8, each written EXACTLY as 'M:SS label' — a timestamp, one space, then the label — because the renderer parses the leading timestamp out of each line. Times must ascend, start at 0:00, and stay under about 5 minutes so they land inside a normal song. Labels are lowercase, specific, and get steadily more sincere as the list goes down: the first is a joke, the last one should land. Mine the sender's story for real moments rather than generic milestones.",
      example: "2:14 the part where I fell for you",
    },
    {
      path: "description.outro",
      label: "Description — the real writing",
      kind: "list",
      max: 3,
      itemMax: 400,
      required: true,
      guide:
        "THE EMOTIONAL PAYLOAD, rendered in a serif beneath the chapter list. The upload-description voice stops here completely. 1 to 3 paragraphs, 200 to 500 characters total, written directly to her rather than to an audience. No timestamps, no jokes, no sign-off like 'like and subscribe'. One concrete detail from the sender's story so it could not have been written about anyone else.",
      example: "I don't really know what this is. I just wanted one place where all of it was in order.",
    },
    {
      path: "contributorPrompt",
      label: "Prompt shown to friends",
      kind: "text",
      max: 140,
      guide:
        "Shown to friends who open the comment link. Short and warm, names both of them, and makes clear that one line is enough. It has to work on someone skimming a group chat.",
      example: "Karan made this for Meera. Leave a comment — one line is plenty.",
    },
  ],
};
