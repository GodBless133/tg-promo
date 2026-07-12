export type CampaignStatus = "draft" | "active" | "paused" | "completed";
export type TargetType = "channel" | "chat" | "bot";
export type ChatStatus = "found" | "selected" | "skipped";
export type AdPostStatus = "generated" | "approved" | "sent" | "failed";
export type SendLogStatus = "pending" | "sent" | "failed";

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  targetUrl: string;
  targetType: TargetType;
  topic: string | null;
  status: CampaignStatus;
  intervalMinutes: number;
  createdAt: string;
  updatedAt: string;
  _count?: {
    targetChats: number;
    adPosts: number;
    sendLogs: number;
  };
}

export interface TargetChat {
  id: string;
  campaignId: string;
  title: string;
  tgLink: string;
  description: string | null;
  membersCount: number | null;
  category: string | null;
  status: ChatStatus;
  foundAt: string;
}

export interface AdPost {
  id: string;
  campaignId: string;
  content: string;
  variant: number;
  status: AdPostStatus;
  createdAt: string;
}

export interface SendLog {
  id: string;
  campaignId: string;
  targetChatId: string | null;
  adPostId: string | null;
  status: SendLogStatus;
  errorMsg: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  targetChat?: TargetChat | null;
  adPost?: AdPost | null;
}