export type ITag = "nsfw" | "tech" | "furry" | "bridges";

export type IStatus = "online" | "offline";

export type IHomeserver = {
  name: string;
  url: string;
  tags: ITag[];
  status: IStatus;
  /** Response time in ms (low precision, e.g. rounded to 50ms). Only set when status is "online". */
  responseTimeMs?: number;
};

export type IHomeservers = IHomeserver[];
