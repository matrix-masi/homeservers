export type ITag = "nsfw" | "tech" | "furry" | "bridges";

export type IStatus = "online" | "offline";

export type IHomeserver = {
  name: string;
  url: string;
  tags: ITag[];
  status: IStatus;
};

export type IHomeservers = IHomeserver[];
