import { create } from "zustand";

interface AppState {
  // Current view
  activeTab: string;
  setActiveTab: (tab: string) => void;

  // Selected campaign for detail view
  selectedCampaignId: string | null;
  setSelectedCampaignId: (id: string | null) => void;

  // Campaign detail sub-tab
  campaignDetailTab: string;
  setCampaignDetailTab: (tab: string) => void;

  // Loading states (for long AI operations)
  isSearchingChats: boolean;
  setIsSearchingChats: (v: boolean) => void;
  isGeneratingAds: boolean;
  setIsGeneratingAds: (v: boolean) => void;

  // Search progress
  searchProgress: string;
  setSearchProgress: (msg: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: "dashboard",
  setActiveTab: (tab) => set({ activeTab: tab, selectedCampaignId: null }),

  selectedCampaignId: null,
  setSelectedCampaignId: (id) =>
    set({ selectedCampaignId: id, campaignDetailTab: "chats" }),

  campaignDetailTab: "chats",
  setCampaignDetailTab: (tab) => set({ campaignDetailTab: tab }),

  isSearchingChats: false,
  setIsSearchingChats: (v) => set({ isSearchingChats: v }),
  isGeneratingAds: false,
  setIsGeneratingAds: (v) => set({ isGeneratingAds: v }),

  searchProgress: "",
  setSearchProgress: (msg) => set({ searchProgress: msg }),
}));