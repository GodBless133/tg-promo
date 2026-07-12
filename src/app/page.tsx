"use client";

import React, { useState, useEffect } from "react";
import {
  Send,
  LayoutDashboard,
  Megaphone,
  Search,
  Sparkles,
  Clock,
  Play,
  Pause,
  Plus,
  Trash2,
  ArrowLeft,
  Users,
  FileText,
  BarChart3,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Bot,
  MessageSquare,
  Hash,
  RefreshCw,
  Copy,
  Check,
  Settings2,
  Zap,
  Target,
  UserCircle,
  ShieldCheck,
  ShieldX,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Campaign,
  TargetChat,
  AdPost,
  SendLog,
  TargetType,
} from "@/lib/types";

// Safe JSON parse — handles empty/truncated responses
async function safeJson(res: Response) {
  const text = await res.text();
  if (!text.trim()) throw new Error("Сервер вернул пустой ответ. Попробуйте ещё раз.");
  try { return JSON.parse(text); }
  catch { throw new Error(text.slice(0, 200) || "Некорректный ответ сервера"); }
}

// ─── Status Badge Helper ───────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    draft: { label: "Черновик", className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
    active: { label: "Активна", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
    paused: { label: "Пауза", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
    completed: { label: "Завершена", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400" },
    found: { label: "Найден", className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
    selected: { label: "Выбран", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
    skipped: { label: "Пропущен", className: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500" },
    generated: { label: "Сгенерирован", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400" },
    approved: { label: "Одобрен", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
    sent: { label: "Отправлено", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
    pending: { label: "Ожидание", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
    failed: { label: "Ошибка", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  };
  const v = variants[status] || { label: status, className: "bg-zinc-100 text-zinc-700" };
  return <Badge variant="secondary" className={v.className}>{v.label}</Badge>;
}

// ─── Dashboard ──────────────────────────────────────────
function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: () => fetch("/api/stats").then((r) => r.json()),
  });

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  const statCards = [
    {
      label: "Кампании",
      value: stats.totalCampaigns as number,
      sub: `${stats.activeCampaigns} активных`,
      icon: Megaphone,
      color: "text-emerald-600",
    },
    {
      label: "Выбранные чаты",
      value: stats.totalChats as number,
      sub: "для рекламы",
      icon: Users,
      color: "text-sky-600",
    },
    {
      label: "Рекламные тексты",
      value: stats.totalPosts as number,
      sub: "сгенерировано",
      icon: FileText,
      color: "text-violet-600",
    },
    {
      label: "Отправлено",
      value: stats.totalSent as number,
      sub: `${stats.pendingSends} в очереди`,
      icon: Send,
      color: "text-amber-600",
    },
  ];

  const recentLogs = (stats.recentLogs as Array<Record<string, unknown>>) || [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Дашборд</h1>
        <p className="text-muted-foreground mt-1">
          Обзор рекламных кампаний в Telegram
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.label} className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                </div>
                <div className={`${card.color} opacity-20`}>
                  <card.icon className="h-12 w-12" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Последняя активность
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              Пока нет активности. Создайте первую кампанию!
            </p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {recentLogs.map((log: Record<string, unknown>) => (
                <div
                  key={log.id as string}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    {(log.status as string) === "sent" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (log.status as string) === "pending" ? (
                      <Clock className="h-4 w-4 text-amber-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {(log.campaign as Record<string, string>)?.name || "Кампания"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(log.targetChat as Record<string, string>)?.title || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={log.status as string} />
                    <p className="text-xs text-muted-foreground mt-1">
                      {log.scheduledAt
                        ? new Date(log.scheduledAt as string).toLocaleString("ru-RU")
                        : new Date(log.createdAt as string).toLocaleString("ru-RU")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Campaign List ──────────────────────────────────────
function CampaignList({ onSelect }: { onSelect: (id: string) => void }) {
  const queryClient = useQueryClient();
  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: () => fetch("/api/campaigns").then((r) => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Кампания удалена");
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Кампании</h1>
          <p className="text-muted-foreground mt-1">
            Управление рекламными кампаниями
          </p>
        </div>
        <CreateCampaignDialog />
      </div>

      {campaigns.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center text-center">
            <Megaphone className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold text-lg">Нет кампаний</h3>
            <p className="text-muted-foreground text-sm mt-1 max-w-sm">
              Создайте первую рекламную кампанию для продвижения вашего Telegram
              канала, чата или бота
            </p>
            <div className="mt-4">
              <CreateCampaignDialog />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer hover:shadow-md transition-shadow group"
              onClick={() => onSelect(c.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {c.targetType === "bot" ? (
                      <Bot className="h-5 w-5 text-violet-500" />
                    ) : c.targetType === "chat" ? (
                      <MessageSquare className="h-5 w-5 text-sky-500" />
                    ) : (
                      <Hash className="h-5 w-5 text-emerald-500" />
                    )}
                    <CardTitle className="text-base line-clamp-1">{c.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={c.status} />
                  </div>
                </div>
                {c.topic && (
                  <CardDescription className="line-clamp-2">{c.topic}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                  <span className="flex items-center gap-1">
                    <Target className="h-3.5 w-3.5" />
                    {c._count?.targetChats || 0} чатов
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {c._count?.adPosts || 0} текстов
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {c.intervalMinutes} мин
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString("ru-RU")}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(c.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Create Campaign Dialog ─────────────────────────────
function CreateCampaignDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("channel");
  const [topic, setTopic] = useState("");
  const [interval, setInterval] = useState("30");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          targetUrl,
          targetType,
          topic,
          intervalMinutes: parseInt(interval),
        }),
      });
      if (!res.ok) throw new Error("Ошибка при создании");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Кампания создана!");
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setOpen(false);
      setName("");
      setDescription("");
      setTargetUrl("");
      setTopic("");
      setInterval("30");
    },
    onError: () => {
      toast.error("Ошибка при создании кампании");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Новая кампания
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Новая рекламная кампания</DialogTitle>
          <DialogDescription>
            Заполните информацию о рекламируемом Telegram-ресурсе
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Название кампании *</Label>
            <Input
              id="name"
              placeholder="Реклама крипто-канала"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="type">Тип ресурса</Label>
            <Select value={targetType} onValueChange={(v) => setTargetType(v as TargetType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="channel">Telegram Канал</SelectItem>
                <SelectItem value="chat">Telegram Чат/Группа</SelectItem>
                <SelectItem value="bot">Telegram Бот</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="url">Ссылка на ресурс *</Label>
            <Input
              id="url"
              placeholder="https://t.me/my_channel"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="topic">Тематика</Label>
            <Input
              id="topic"
              placeholder="Криптовалюта, бизнес, технологии..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="desc">Описание</Label>
            <Textarea
              id="desc"
              placeholder="Кратко опишите, что рекламируете"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="interval">Интервал отправки (минуты)</Label>
            <Input
              id="interval"
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !name || !targetUrl}
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Campaign Detail ────────────────────────────────────
function CampaignDetail({ campaignId, onBack }: { campaignId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { campaignDetailTab, setCampaignDetailTab } = useAppStore();
  const [editOpen, setEditOpen] = useState(false);

  const { data: campaign, isLoading } = useQuery<Campaign>({
    queryKey: ["campaign", campaignId],
    queryFn: () => fetch(`/api/campaigns/${campaignId}`).then((r) => r.json()),
    enabled: !!campaignId,
  });

  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: () => fetch("/api/campaigns").then((r) => r.json()),
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/start`, { method: "POST" });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      await fetch(`/api/campaigns/${campaignId}/stop`, { method: "POST" });
    },
    onSuccess: () => {
      toast.success("Кампания приостановлена");
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  if (isLoading || !campaign) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const c = campaigns.find((x) => x.id === campaignId) || campaign;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {c.targetType === "bot" ? (
              <Bot className="h-5 w-5 text-violet-500" />
            ) : c.targetType === "chat" ? (
              <MessageSquare className="h-5 w-5 text-sky-500" />
            ) : (
              <Hash className="h-5 w-5 text-emerald-500" />
            )}
            <h1 className="text-2xl font-bold tracking-tight truncate">{c.name}</h1>
            <StatusBadge status={c.status} />
          </div>
          {c.topic && (
            <p className="text-muted-foreground text-sm mt-0.5">{c.topic}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Settings2 className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Настройки</span>
          </Button>
          {c.status === "active" ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
            >
              <Pause className="h-4 w-4 mr-1" />
              Пауза
            </Button>
          ) : c.status === "draft" || c.status === "paused" ? (
            <Button
              size="sm"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              Запустить
            </Button>
          ) : null}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="py-3">
          <CardContent className="p-3 flex items-center gap-3">
            <Target className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xl font-bold">{c._count?.targetChats || 0}</p>
              <p className="text-xs text-muted-foreground">Чатов найдено</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-3 flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xl font-bold">{c._count?.adPosts || 0}</p>
              <p className="text-xs text-muted-foreground">Текстов</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-3 flex items-center gap-3">
            <Send className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xl font-bold">{c._count?.sendLogs || 0}</p>
              <p className="text-xs text-muted-foreground">Отправок</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-3 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xl font-bold">{c.intervalMinutes} мин</p>
              <p className="text-xs text-muted-foreground">Интервал</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={campaignDetailTab} onValueChange={setCampaignDetailTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="chats" className="text-xs sm:text-sm">
            <Search className="h-4 w-4 mr-1 hidden sm:inline" />
            Чаты
          </TabsTrigger>
          <TabsTrigger value="ads" className="text-xs sm:text-sm">
            <Sparkles className="h-4 w-4 mr-1 hidden sm:inline" />
            Тексты
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4 mr-1 hidden sm:inline" />
            Логи
          </TabsTrigger>
          <TabsTrigger value="info" className="text-xs sm:text-sm">
            <Zap className="h-4 w-4 mr-1 hidden sm:inline" />
            О кампании
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chats">
          <ChatSearchPanel campaignId={campaignId} />
        </TabsContent>
        <TabsContent value="ads">
          <AdGeneratorPanel campaignId={campaignId} />
        </TabsContent>
        <TabsContent value="logs">
          <SendLogPanel campaignId={campaignId} />
        </TabsContent>
        <TabsContent value="info">
          <CampaignInfo campaign={c} />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <EditCampaignDialog
        campaign={c}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}

// ─── Edit Campaign Dialog ───────────────────────────────
function EditCampaignDialog({
  campaign,
  open,
  onOpenChange,
}: {
  campaign: Campaign;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description || "");
  const [targetUrl, setTargetUrl] = useState(campaign.targetUrl);
  const [targetType, setTargetType] = useState<TargetType>(campaign.targetType);
  const [topic, setTopic] = useState(campaign.topic || "");
  const [interval, setInterval] = useState(String(campaign.intervalMinutes));

  // Reset form when dialog opens or campaign changes
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setName(campaign.name);
      setDescription(campaign.description || "");
      setTargetUrl(campaign.targetUrl);
      setTargetType(campaign.targetType);
      setTopic(campaign.topic || "");
      setInterval(String(campaign.intervalMinutes));
    }
    onOpenChange(v);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          targetUrl,
          targetType,
          topic,
          intervalMinutes: parseInt(interval),
        }),
      });
      if (!res.ok) throw new Error("Ошибка обновления");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Кампания обновлена");
      queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Ошибка при сохранении");
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Редактировать кампанию</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Тип ресурса</Label>
            <Select value={targetType} onValueChange={(v) => setTargetType(v as TargetType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="channel">Канал</SelectItem>
                <SelectItem value="chat">Чат</SelectItem>
                <SelectItem value="bot">Бот</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Ссылка</Label>
            <Input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Тематика</Label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Описание</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <Label>Интервал (мин)</Label>
            <Input
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Chat Search Panel ──────────────────────────────────
function ChatSearchPanel({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient();
  const { isSearchingChats, setIsSearchingChats, searchProgress, setSearchProgress } =
    useAppStore();
  const { data: chats = [], isLoading } = useQuery<TargetChat[]>({
    queryKey: ["chats", campaignId],
    queryFn: () => fetch(`/api/campaigns/${campaignId}/chats`).then((r) => r.json()),
  });

  // Track which chats the user has toggled manually
  const [manualOverrides, setManualOverrides] = useState<Record<string, boolean>>({});

  // Compute effective selected state: manual override > db status
  const effectiveSelectedIds = new Set(
    chats
      .filter((c) => {
        if (c.id in manualOverrides) return manualOverrides[c.id];
        return c.status === "selected";
      })
      .map((c) => c.id)
  );

  const searchMutation = useMutation({
    mutationFn: async () => {
      setIsSearchingChats(true);
      setSearchProgress("Подключение к ИИ...");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 150000);
      try {
        setSearchProgress("Ищем чаты в интернете...");
        const res = await fetch(`/api/campaigns/${campaignId}/search-chats`, {
          method: "POST",
          signal: controller.signal,
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.error || "Ошибка поиска");
        if (data.success === false && data.error) throw new Error(data.error);
        return data;
      } finally {
        clearTimeout(timeout);
      }
    },
    onSuccess: (data) => {
      if (data.count > 0) {
        toast.success(`Найдено ${data.count} чатов!`);
      } else {
        toast.warning("Чаты не найдены, попробуйте другую тему");
      }
      queryClient.invalidateQueries({ queryKey: ["chats", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setManualOverrides({});
    },
    onError: (err) => {
      const msg = err.name === "AbortError"
        ? "Превышено время ожидания. Попробуйте ещё раз."
        : err.message;
      toast.error(msg);
    },
    onSettled: () => {
      setIsSearchingChats(false);
      setSearchProgress("");
    },
  });

  const toggleSelect = (chatId: string) => {
    setManualOverrides((prev) => {
      const currentSelected = chatId in prev ? prev[chatId] : chats.find((c) => c.id === chatId)?.status === "selected";
      return { ...prev, [chatId]: !currentSelected };
    });
  };

  const selectAll = () => {
    const overrides: Record<string, boolean> = {};
    chats.filter((c) => c.status === "found").forEach((c) => {
      overrides[c.id] = true;
    });
    setManualOverrides((prev) => ({ ...prev, ...overrides }));
  };

  const saveSelection = async () => {
    const selectedArr = Array.from(effectiveSelectedIds);
    const allIds = chats.map((c) => c.id);

    if (selectedArr.length > 0) {
      await fetch(`/api/campaigns/${campaignId}/chats`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatIds: selectedArr, status: "selected" }),
      });
    }

    const skippedArr = allIds.filter((id) => !effectiveSelectedIds.has(id));
    if (skippedArr.length > 0) {
      await fetch(`/api/campaigns/${campaignId}/chats`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatIds: skippedArr, status: "skipped" }),
      });
    }

    toast.success(`Выбрано ${selectedArr.length} чатов`);
    setManualOverrides({});
    queryClient.invalidateQueries({ queryKey: ["chats", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  if (isLoading) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Поиск чатов для рекламы
            </CardTitle>
            <CardDescription className="mt-1">
              ИИ найдёт подходящие Telegram чаты по вашей тематике
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={selectAll}
              disabled={isSearchingChats}
            >
              Выбрать все
            </Button>
            {effectiveSelectedIds.size > 0 && (
              <Button size="sm" onClick={saveSelection}>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Сохранить ({effectiveSelectedIds.size})
              </Button>
            )}
            <Button onClick={() => searchMutation.mutate()} disabled={isSearchingChats}>
              {isSearchingChats ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {searchProgress || "Поиск..."}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Найти чаты
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chats.length === 0 && !isSearchingChats ? (
          <div className="text-center py-12">
            <Search className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              Нажмите &quot;Найти чаты&quot; чтобы ИИ подобрал подходящие чаты для рекламы
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <div className="space-y-2">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    effectiveSelectedIds.has(chat.id)
                      ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                      : chat.status === "skipped"
                      ? "border-zinc-200 opacity-60 dark:border-zinc-800"
                      : "border-border hover:border-emerald-200 dark:hover:border-emerald-800"
                  }`}
                  onClick={() => toggleSelect(chat.id)}
                >
                  <Switch
                    checked={effectiveSelectedIds.has(chat.id)}
                    onCheckedChange={() => toggleSelect(chat.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{chat.title}</p>
                      {chat.membersCount && chat.membersCount > 0 && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          <Users className="h-3 w-3 mr-1" />
                          {chat.membersCount.toLocaleString("ru-RU")}
                        </Badge>
                      )}
                      {chat.category && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          {chat.category}
                        </Badge>
                      )}
                    </div>
                    {chat.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {chat.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <a
                        href={chat.tgLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-sky-600 hover:underline flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" />
                        {chat.tgLink.length > 50 ? chat.tgLink.slice(0, 50) + "..." : chat.tgLink}
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Ad Generator Panel ─────────────────────────────────
function AdGeneratorPanel({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient();
  const { isGeneratingAds, setIsGeneratingAds } = useAppStore();
  const [variantCount, setVariantCount] = useState("3");

  const { data: posts = [], isLoading } = useQuery<AdPost[]>({
    queryKey: ["ads", campaignId],
    queryFn: () => fetch(`/api/campaigns/${campaignId}/ads`).then((r) => r.json()),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      setIsGeneratingAds(true);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/generate-ads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: parseInt(variantCount) }),
          signal: controller.signal,
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.error || "Ошибка генерации");
        return data;
      } finally {
        clearTimeout(timeout);
      }
    },
    onSuccess: (data) => {
      if (data.count > 0) {
        toast.success(`Сгенерировано ${data.count} вариантов!`);
      } else {
        toast.warning("Не удалось сгенерировать тексты");
      }
      queryClient.invalidateQueries({ queryKey: ["ads", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err) => {
      const msg = err.name === "AbortError"
        ? "Превышено время ожидания. Попробуйте ещё раз."
        : err.message;
      toast.error(msg);
    },
    onSettled: () => {
      setIsGeneratingAds(false);
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetch(`/api/campaigns/${campaignId}/ads`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, status: "approved" }),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      toast.success("Текст одобрен");
      queryClient.invalidateQueries({ queryKey: ["ads", campaignId] });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Скопировано!");
  };

  if (isLoading) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Генератор рекламных текстов
            </CardTitle>
            <CardDescription className="mt-1">
              ИИ создаст рекламные тексты под вашу нишу
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={variantCount} onValueChange={setVariantCount}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 вар.</SelectItem>
                <SelectItem value="3">3 вар.</SelectItem>
                <SelectItem value="5">5 вар.</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={isGeneratingAds}
            >
              {isGeneratingAds ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Генерация...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Сгенерировать
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {posts.length === 0 && !isGeneratingAds ? (
          <div className="text-center py-12">
            <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              Сгенерируйте рекламные тексты с помощью ИИ
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-3">
              {posts.map((post) => (
                <div key={post.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Вариант #{post.variant}</Badge>
                      <StatusBadge status={post.status} />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => copyToClipboard(post.content)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      {post.status === "generated" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => approveMutation.mutate(post.id)}
                          disabled={approveMutation.isPending}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Одобрить
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {post.content}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(post.createdAt).toLocaleString("ru-RU")}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Send Log Panel ─────────────────────────────────────
function SendLogPanel({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading } = useQuery<SendLog[]>({
    queryKey: ["logs", campaignId],
    queryFn: () => fetch(`/api/campaigns/${campaignId}/logs`).then((r) => r.json()),
  });

  if (isLoading) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Логи отправки
            </CardTitle>
            <CardDescription>История и статус рассылки</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["logs", campaignId] })}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Обновить
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-12">
            <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              Логи отправки появятся после запуска кампании
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 border rounded-lg"
                >
                  {log.status === "sent" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                  ) : log.status === "pending" ? (
                    <Clock className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">
                        {log.targetChat?.title || "—"}
                      </p>
                      <StatusBadge status={log.status} />
                    </div>
                    {log.scheduledAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Запланировано:{" "}
                        {new Date(log.scheduledAt).toLocaleString("ru-RU")}
                      </p>
                    )}
                    {log.sentAt && (
                      <p className="text-xs text-muted-foreground">
                        Отправлено: {new Date(log.sentAt).toLocaleString("ru-RU")}
                      </p>
                    )}
                    {log.errorMsg && (
                      <p className="text-xs text-red-500 mt-1">{log.errorMsg}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Campaign Info ──────────────────────────────────────
function CampaignInfo({ campaign }: { campaign: Campaign }) {
  const targetTypeLabel =
    campaign.targetType === "bot"
      ? "Telegram Бот"
      : campaign.targetType === "chat"
      ? "Telegram Чат"
      : "Telegram Канал";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Информация о кампании</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Название</p>
            <p className="text-sm font-medium">{campaign.name}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Статус</p>
            <StatusBadge status={campaign.status} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Тип ресурса</p>
            <p className="text-sm font-medium">{targetTypeLabel}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Тематика</p>
            <p className="text-sm font-medium">{campaign.topic || "—"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Ссылка</p>
            <a
              href={campaign.targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-sky-600 hover:underline flex items-center gap-1"
            >
              {campaign.targetUrl}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Интервал</p>
            <p className="text-sm font-medium">{campaign.intervalMinutes} минут</p>
          </div>
        </div>
        {campaign.description && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Описание</p>
            <p className="text-sm">{campaign.description}</p>
          </div>
        )}
        <Separator />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Создана</p>
            <p className="text-sm">{new Date(campaign.createdAt).toLocaleString("ru-RU")}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Обновлена</p>
            <p className="text-sm">{new Date(campaign.updatedAt).toLocaleString("ru-RU")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Telegram Account Panel ─────────────────────────────
type AuthStep = "idle" | "code" | "2fa";

function TelegramAccountPanel() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<AuthStep>("idle");
  const [phone, setPhone] = useState("");
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/tg-account");
      const data = await res.json();
      setStatus(data);

      if (data.status === "awaiting_code") setStep("code");
      else if (data.status === "awaiting_2fa") setStep("2fa");
      else if (data.status === "connected") setStep("idle");
      else setStep("idle");
    } catch {
      setStatus({ connected: false, status: "none", phone: null });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/tg-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, apiId, apiHash }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Код отправлен в Telegram!");
        setStep("code");
        fetchStatus();
      } else {
        toast.error(data.error || "Ошибка подключения");
      }
    } catch { toast.error("Сервис Telegram недоступен"); }
    finally { setActionLoading(false); }
  };

  const handleVerifyCode = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/tg-account/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Аккаунт подключён!");
        setStep("idle");
        fetchStatus();
      } else if (data.need2fa) {
        toast.info("Требуется двухфакторная аутентификация");
        setStep("2fa");
        fetchStatus();
      } else {
        toast.error(data.error || "Неверный код");
      }
    } catch { toast.error("Ошибка верификации"); }
    finally { setActionLoading(false); }
  };

  const handleVerify2fa = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/tg-account/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Аккаунт подключён!");
        setStep("idle");
        fetchStatus();
      } else {
        toast.error(data.error || "Неверный пароль");
      }
    } catch { toast.error("Ошибка 2FA"); }
    finally { setActionLoading(false); }
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    try {
      await fetch("/api/tg-account/disconnect", { method: "POST" });
      toast.success("Аккаунт отключён");
      setStep("idle");
      setPhone(""); setApiId(""); setApiHash("");
      fetchStatus();
    } catch { toast.error("Ошибка отключения"); }
    finally { setActionLoading(false); }
  };

  const isConnected = status?.connected === true;

  if (loading) {
    return <div className="p-6"><Skeleton className="h-96 rounded-xl" /></div>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Smartphone className="h-6 w-6" />
          Telegram Аккаунт
        </h1>
        <p className="text-muted-foreground mt-1">
          Подключите аккаунт для автоматической отправки рекламы
        </p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Статус подключения
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isConnected ? (
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium">
                  {status.firstName || ""} {status.lastName || ""}
                  {status.username ? ` (@${status.username})` : ""}
                </p>
                <p className="text-sm text-muted-foreground">{status.phone as string}</p>
              </div>
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">Подключён</Badge>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <ShieldX className="h-5 w-5 text-zinc-400" />
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Не подключён</p>
                <p className="text-sm text-muted-foreground">Аккаунт не привязан</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auth Form */}
      {!isConnected && step === "idle" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Подключение аккаунта</CardTitle>
            <CardDescription>
              Данные нужны для авторизации через Telegram API. Получите API ID и Hash на{" "}
              <a href="https://my.telegram.org/apps" target="_blank" rel="noopener" className="text-primary underline">
                my.telegram.org
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Номер телефона</Label>
              <Input placeholder="+79001234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>API ID</Label>
                <Input placeholder="12345678" value={apiId} onChange={(e) => setApiId(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>API Hash</Label>
                <Input placeholder="abc123def456..." value={apiHash} onChange={(e) => setApiHash(e.target.value)} />
              </div>
            </div>
            <Button className="w-full" onClick={handleConnect} disabled={actionLoading || !phone || !apiId || !apiHash}>
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Получить код
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Code Verification */}
      {!isConnected && step === "code" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCircle className="h-5 w-5" />
              Введите код из Telegram
            </CardTitle>
            <CardDescription>Код отправлен на номер {status?.phone || phone}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Код подтверждения</Label>
              <Input placeholder="12345" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            </div>
            <Button className="w-full" onClick={handleVerifyCode} disabled={actionLoading || !code}>
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Подтвердить
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 2FA */}
      {!isConnected && step === "2fa" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Двухфакторная аутентификация</CardTitle>
            <CardDescription>Введите пароль от вашего Telegram аккаунта</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Пароль</Label>
              <Input type="password" placeholder="••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleVerify2fa} disabled={actionLoading || !password}>
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Подтвердить пароль
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Connected actions */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Управление</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={handleDisconnect} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Отключить аккаунт
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3 text-sm text-muted-foreground">
            <p><strong className="text-foreground">Как получить API ID и Hash:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Откройте <a href="https://my.telegram.org/apps" target="_blank" rel="noopener" className="text-primary underline">my.telegram.org</a></li>
              <li>Войдите с номером телефона</li>
              <li>Создайте приложение (любое название)</li>
              <li>Скопируйте <code className="bg-muted px-1 rounded">api_id</code> и <code className="bg-muted px-1 rounded">api_hash</code></li>
            </ol>
            <p className="pt-2"><strong className="text-foreground">Безопасность:</strong> Сессия хранится локально и не передаётся третьим лицам.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────
export default function Home() {
  const { activeTab, setActiveTab, selectedCampaignId, setSelectedCampaignId } = useAppStore();

  const handleSelectCampaign = (id: string) => {
    setSelectedCampaignId(id);
  };

  const handleBack = () => {
    setSelectedCampaignId(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center h-14 px-4 lg:px-6">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            <span className="font-bold text-lg tracking-tight">TG Promo</span>
          </div>
          <nav className="ml-6 flex items-center gap-1">
            <Button
              variant={activeTab === "dashboard" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("dashboard")}
            >
              <LayoutDashboard className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Дашборд</span>
            </Button>
            <Button
              variant={activeTab === "campaigns" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("campaigns")}
            >
              <Megaphone className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Кампании</span>
            </Button>
            <Button
              variant={activeTab === "account" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("account")}
            >
              <UserCircle className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Аккаунт</span>
            </Button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {selectedCampaignId ? (
          <CampaignDetail campaignId={selectedCampaignId} onBack={handleBack} />
        ) : activeTab === "dashboard" ? (
          <Dashboard />
        ) : activeTab === "account" ? (
          <TelegramAccountPanel />
        ) : (
          <CampaignList onSelect={handleSelectCampaign} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t py-4 px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>TG Promo — AI-платформа для Telegram рекламы</p>
          <p>Powered by Z.ai</p>
        </div>
      </footer>
    </div>
  );
}