/**
 * ⭐ YÜKLEME UCUNUN ORTAK GÖVDESİ — oyuncu, anonim ve yönetici uçları bunu paylaşıyor.
 *
 * Üç yerde ayrı ayrı yazılsaydı doğrulama zincirinin bir halkası bir yerde unutulurdu; ve
 * unutulan halka **magic byte** ya da **piksel tavanı** olsaydı hata sessiz olurdu (dosya
 * kabul edilir, sorun aylar sonra çıkar). Tek gövde bunu yapısal olarak engelliyor.
 */
import { sql } from 'drizzle-orm';
import type { SupportUploadResult } from '@mobilwar/contracts';
import type { Db } from '../db/client.ts';
import { supportLimits } from './support.limits.ts';
import {
  imageSize, newStorageKey, sniffImage, stripJpegMetadata, uploadsEnabled, writeAttachment,
} from './storage.ts';
import { SupportError } from './support.service.ts';

/** Fastify multipart parçasının ihtiyacımız olan kadarı (kütüphane tipine bağlanmamak için). */
export interface UploadPart {
  toBuffer(): Promise<Buffer>;
  /** Kütüphane `limits.fileSize`ı aştığında bu bayrağı kaldırıyor. */
  file?: { truncated?: boolean };
}

/**
 * Doğrular, diske yazar, satırı açar. **Sıra kritik**: dosya diske DB satırından ÖNCE gider
 * (ters sıra "kayıt var, dosya yok" verir; bu sıra en fazla yetim dosya bırakır ve onu
 * süpürücü topluyor).
 */
export async function handleUpload(
  db: Db, part: UploadPart | undefined,
  by: { accountId: number | null; ip: string },
): Promise<SupportUploadResult> {
  if (!uploadsEnabled()) throw new SupportError('upload_disabled', 503);
  if (!part) throw new SupportError('invalid_request', 400);

  const lim = supportLimits();

  if (by.accountId != null) {
    const recent = await db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM support_attachments
       WHERE uploaded_by_account_id = ${by.accountId} AND created_at > now() - interval '1 hour'
    `);
    if (Number(recent[0]?.['n'] ?? 0) >= lim.uploadsPerHour) {
      throw new SupportError('rejected', 429);
    }
  } else {
    const recent = await db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM support_attachments
       WHERE uploaded_by_account_id IS NULL AND uploaded_ip = ${by.ip}
         AND created_at > now() - interval '1 hour'
    `);
    if (Number(recent[0]?.['n'] ?? 0) >= lim.anonPerIpPerHour) {
      throw new SupportError('rejected', 429);
    }
  }

  const raw = await part.toBuffer();
  /**
   * ⚠️ İki ayrı kontrol, ikisi de gerekli: `truncated` kütüphanenin akış sırasında koyduğu
   * bayrak (asıl fren, erken kesiyor), uzunluk kontrolü ise limit yapılandırması bir gün
   * kayarsa diye ikinci savunma.
   */
  if (part.file?.truncated || raw.length > lim.maxAttachmentBytes) {
    throw new SupportError('attachment_too_large', 413);
  }
  if (raw.length === 0) throw new SupportError('invalid_request', 400);

  // ⚠️ Tür İSTEMCİDEN DEĞİL baytlardan. `content-type` ve dosya adı saldırganın yazdığı dizeler.
  const mime = sniffImage(raw);
  if (!mime) throw new SupportError('attachment_invalid', 415);

  // ⚠️ Okuyamazsak REDDET, varsayma: piksel tavanı bombaya karşı tek savunma.
  const size = imageSize(raw, mime);
  if (!size) throw new SupportError('attachment_invalid', 415);
  if (size.width * size.height > lim.maxAttachmentPixels) {
    throw new SupportError('attachment_invalid', 413);
  }

  // EXIF/GPS temizliği — yalnız JPEG'de anlamlı (bkz. `storage.ts` · `sharp` kararı).
  const data = mime === 'image/jpeg' ? stripJpegMetadata(raw) : raw;

  const key = newStorageKey(mime);
  await writeAttachment(key, data);

  const ins = await db.execute<Record<string, unknown>>(sql`
    INSERT INTO support_attachments
      (storage_key, mime, bytes, width, height, uploaded_by_account_id, uploaded_ip)
    VALUES (${key}, ${mime}, ${data.length}, ${size.width}, ${size.height},
            ${by.accountId}, ${by.ip})
    RETURNING id
  `);

  return {
    attachmentId: Number(ins[0]!['id']),
    mime, bytes: data.length, width: size.width, height: size.height,
  };
}

/**
 * Ek indirme yetkisi + servis bilgisi.
 *
 * ⚠️ Yetkisizde **404** (403 değil): "bu ek var ama senin değil" bilgisi bile sızmasın.
 * ⚠️ Henüz bir talebe bağlanmamış ek YALNIZ yükleyenine açık — aksi hâlde id tahmin ederek
 * başkasının yarım kalan yüklemesi okunabilirdi.
 */
export async function authorizeAttachment(
  db: Db, attachmentId: number,
  by: { accountId?: number; token?: string; staff?: boolean },
): Promise<{ storageKey: string; mime: string }> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT a.storage_key, a.mime, a.ticket_id, a.uploaded_by_account_id,
           t.account_id, t.public_token_hash, t.public_token_expires_at
      FROM support_attachments a
      LEFT JOIN support_tickets t ON t.id = a.ticket_id
     WHERE a.id = ${attachmentId}
  `);
  const r = rows[0];
  if (!r) throw new SupportError('invalid_request', 404);

  let ok = by.staff === true;
  if (!ok && by.accountId != null) {
    ok = Number(r['uploaded_by_account_id']) === by.accountId
      || (r['account_id'] != null && Number(r['account_id']) === by.accountId);
  }
  if (!ok && by.token && r['public_token_hash'] != null) {
    const { createHash } = await import('node:crypto');
    const exp = r['public_token_expires_at'];
    ok = r['public_token_hash'] === createHash('sha256').update(by.token).digest('hex')
      && exp != null && new Date(String(exp)).getTime() > Date.now();
  }
  if (!ok) throw new SupportError('invalid_request', 404);

  return { storageKey: String(r['storage_key']), mime: String(r['mime']) };
}
