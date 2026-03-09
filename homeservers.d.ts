export type ITag = "nsfw" | "tech" | "furry" | "bridges";

export type IStatus = "online" | "offline" | "dead";

export type IHomeserver = {
  name: string;
  url: string;
  tags: ITag[];
  status: IStatus;
  /** Response time in ms (low precision, e.g. rounded to 50ms). Only set when status is "online". */
  responseTimeMs?: number;
  /** Consecutive offline check count. When it reaches 12, status is set to "dead" and the server is no longer checked. */
  failCount?: number;
};

export type IHomeservers = IHomeserver[];
