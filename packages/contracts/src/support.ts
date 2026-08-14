import { z } from 'zod';

/**
 * DESTEK / İLETİŞİM SÖZLEŞMESİ (kullanıcı, 2026-08-14).
 *
 * ⚠️ **Hiçbir istemci yükü `worldId` TAŞIMAZ** — `chat.ts` ile aynı kural: dünya kimliği JWT'den
 * gelir ve sunucuda sabitlenir. Anonim talepte de öyle: dünya NULL kalır, istemciden okunmaz.
 *
 * ⚠️ **Talebin hesapla ilişkisi YALNIZ oturumdan kurulur, asla yükten.** Verilen e-postaya bakıp
 * hesap eşleştirmek iki kapıyı birden açardı: (1) "bu adres kayıtlı mı" varlık sızıntısı,
 * (2) başkası adına talep açıp yöneticiye o hesapta işlem yaptırma.
 *
 * ⚠️ Gövdeler DÜZ METİN — HTML/markdown yok, XSS yüzeyi sıfır.
 */

export const supportCategory = z.enum(['bug', 'account', 'suggestion', 'report', 'other']);
export type SupportCategory = z.infer<typeof supportCategory>;

/** Panelde ve oyuncu formunda gösterilen Türkçe etiketler — tek kaynak. */
export const SUPPORT_CATEGORY_LABEL: Readonly<Record<SupportCategory, string>> = {
  bug: 'Hata bildirimi',
  account: 'Hesap / giriş sorunu',
  suggestion: 'Öneri',
  report: 'Şikayet',
  other: 'Diğer',
};

export const supportStatus = z.enum(['open', 'closed']);
export type SupportStatus = z.infer<typeof supportStatus>;

export const supportSender = z.enum(['user', 'admin']);
export type SupportSender = z.infer<typeof supportSender>;

export const supportTicketId = z.number().int().positive();

/**
 * ⚠️ Sınırlar hem sunucuda hem formda geçerli. `min(20)` gövde için en ucuz spam freni:
 * gerçek kullanıcıya hiçbir maliyeti yok, "asdf" gönderen bota var.
 */
export const supportSubject = z.string().trim().min(5).max(120);
export const supportBody = z.string().trim().min(20).max(4000);

/** Liste satırı — **gövdesiz** (liste/gövde ayrımı, `queries.ts` deseni). */
export const supportTicketSummary = z.object({
  id: supportTicketId,
  subject: z.string(),
  category: supportCategory,
  status: supportStatus,
  lastSender: supportSender,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Oyuncunun okumadığı yönetici mesajı sayısı. */
  unreadCount: z.number().int().nonnegative(),
});
export type SupportTicketSummary = z.infer<typeof supportTicketSummary>;

export const supportMessage = z.object({
  id: z.number().int().positive(),
  sender: supportSender,
  /** ⚠️ Yönetici tarafında DAİMA «Yönetim» — personel kimliği oyuncuya sızmaz. */
  authorName: z.string(),
  body: z.string(),
  /** Ek varsa kimliği; içerik ayrı bir uçtan, yetki kontrolüyle iniyor. */
  attachmentId: z.number().int().positive().nullable(),
  attachmentMime: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type SupportMessage = z.infer<typeof supportMessage>;

export const supportThread = z.object({
  ticket: supportTicketSummary,
  messages: z.array(supportMessage),
  /** İstemci yazma kutusunu buna göre kapatır (kapalı talebe yalnız yönetici dokunur). */
  canReply: z.boolean(),
});
export type SupportThread = z.infer<typeof supportThread>;

/**
 * Talep açma.
 *
 * ⚠️ `email` **giriş yapmış ve DOĞRULANMIŞ** kullanıcıda hiç gönderilmez (sunucu hesaptan alır).
 * Doğrulanmamış hesapta ve anonimde gönderilir — kullanıcı şartı: *"e-posta otomatik doldurulur
 * ama kullanıcı değiştirebilir"*.
 * ⚠️ `website` **BAL KÜPÜ**: gerçek kullanıcı asla doldurmaz, dolu gelirse istek reddedilir.
 * `display:none` DEĞİL, ekran dışına taşınarak gizleniyor (bazı botlar `display:none` atlar).
 */
export const createSupportTicketRequest = z.object({
  subject: supportSubject,
  category: supportCategory,
  body: supportBody,
  email: z.string().trim().email().max(254).optional(),
  attachmentId: z.number().int().positive().optional(),
  website: z.string().max(200).optional(),
});
export type CreateSupportTicketRequest = z.infer<typeof createSupportTicketRequest>;

export const replySupportTicketRequest = z.object({
  body: supportBody,
  attachmentId: z.number().int().positive().optional(),
});
export type ReplySupportTicketRequest = z.infer<typeof replySupportTicketRequest>;

/** Yükleme yanıtı — dosya önce yüklenir, sonra mesaja iliştirilir. */
export const supportUploadResult = z.object({
  attachmentId: z.number().int().positive(),
  mime: z.string(),
  bytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type SupportUploadResult = z.infer<typeof supportUploadResult>;

/**
 * Hata kodları — sunucu **kod** döner, Türkçeleştirme istemcide (`chat.ts` kuralı).
 */
export const supportErrorCode = z.enum([
  'invalid_request',
  /** Kapalı talebe yazılamaz; oyuncu yeni talep açar. */
  'ticket_closed',
  /** Açık talep tavanı doldu. */
  'too_many_open',
  /** Bal küpü doldu ya da gövde çok kısa — istemciye ayrıntı verilmez. */
  'rejected',
  'attachment_too_large',
  /** Magic byte tutmadı, tür desteklenmiyor ya da piksel sınırı aşıldı. */
  'attachment_invalid',
  'upload_disabled',
]);
export type SupportErrorCode = z.infer<typeof supportErrorCode>;
