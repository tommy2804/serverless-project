export enum GIFT_EVENT_STATUS {
  ACTIVE = "ACTIVE",
  USED = "USED",
  INACTIVE = "INACTIVE",
}

export enum EventImagesStatus {
  UPLOADING = "UPLOADING",
  SUSPENDED = "SUSPENDED",
  DONE = "DONE",
}

export interface CreateEventDTO {
  eventName: string;
  nameUrl: string;
  numberOfPhotos?: number;
  thtk?: string;
  creditsToUse?: number;
  giftCreditsToUse?: number;
  eventDate?: any; // dayjs
  location?: string;
  photographerName?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  logo?: boolean;
  mainImage?: boolean;
  selectedGiftEventId?: number;
  selectedGiftEventOrgId?: string;
  watermark?: boolean;
  eventWatermarkSize?: number;
  watermarkPosition?: string;
}

export interface UpdateEventDTO {
  eventId: string;
  eventName?: string;
  eventDate?: any; // dayjs
  location?: string;
  photographerName?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  nameUrl?: string;
  isPublicEvent?: string;
}
