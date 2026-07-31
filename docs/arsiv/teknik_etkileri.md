# Teknik (Yükseltme) Sisteminin Birimlere Etkisi

Ghidra üzerinden keşfedilen `FUN_0040d608` fonksiyonu ve `mobiwar-engine.js` içerisindeki formüller referans alınarak, oyundaki 8 adlandırılmış tekniğin birimlere (savaşçılar ve savunma yapıları) sağladığı bonuslar tam olarak çözülmüştür. 

## 1. Temel Formül ve Katsayılar

Herhangi bir tekniğin sağladığı yeni stat değeri şu formülle hesaplanır:
**`Yeni Stat = Taban Stat × (1 + [Teknik Seviyesi] × k)`**

Ghidra sabitleri (`0x40d608` akışından alınan katsayılar):
- **Can ve Büyü Canı** artışları için `k = 0.05` (**Her seviyede +%5**)
- **Saldırı ve Savunma** artışları için `k = 0.06` (**Her seviyede +%6**)

---

## 2. Savaşçılara (Warriors) Etkisi

Savaşçılar, sahip oldukları gizli **Sınıf (Class)** kimliğine göre farklı Can (HP) tekniklerinden etkilenirler. Diğer saldırı ve zırh teknikleri ise tüm savaşçılara istisnasız uygulanır.

| Teknik Adı | Kazanç (Seviye Başına) | Etkilediği Savaşçılar (Sınıflar) |
| :--- | :--- | :--- |
| **Okçuluk** | +%5 Can (HP) | **Menzilliler ve Uçanlar:** Elf, Pegasus, Şaman, Casus Kuş |
| **Demircilik** | +%5 Can (HP) | **Genel Piyade / Süvari:** Cüce, Süvari, Gnom, Yük Arabası |
| **Kimya** | +%5 Can (HP) | **Kuşatma Araçları:** Mancınık |
| **İçgüdü** | +%5 Can (HP) | **Canavarlar:** Ejderha, Ogre, Kaos |
| **Büyücülük** | +%5 Büyü Canı (Magic HP) | **Tüm Savaşçılar** (Eğer taban Büyü Canı varsa) |
| **Zırh** | +%6 Fiz. Saldırı & +%6 Fiz. Savunma | **Tüm Savaşçılar** |
| **Tılsım** | +%6 Büyü Saldırısı | **Tüm Savaşçılar** |
| **Taş Ustalığı** | *(Etkisi Yok)* | Savaşçılara uygulanmaz. |

---

## 3. Savunma Yapılarına (Defenses) Etkisi

Savunma yapıları (Kule, Surlar vb.), savaşçılardan farklı olarak **bina kategorilerine** göre sınırlandırılmıştır. *Önemli Not: Büyücülük ve İçgüdü teknikleri savunma yapılarına hiçbir şekilde etki etmez.*

| Teknik Adı | Kazanç (Seviye Başına) | Etkilediği Savunma Yapıları |
| :--- | :--- | :--- |
| **Okçuluk** | +%5 Can (HP) | Okçu Kulesi, Balista *(Sur ve Büyü Kalkanı da bu gruba düşer)* |
| **Demircilik** | +%5 Can (HP) | Tuzak, Muhafız |
| **Kimya** | +%5 Can (HP) | Kazancı, Mangonel |
| **Zırh** | +%6 Fiz. Saldırı & +%6 Fiz. Savunma | Tuzak, Kazancı, Muhafız |
| **Taş Ustalığı** | +%6 Fiz. Saldırı & +%6 Fiz. Savunma | Okçu Kulesi, Mangonel, Balista |
| **Tılsım** | +%6 Büyü Saldırısı | **Tüm Savunma Yapıları** |
| **Büyücülük** | *(Etkisi Yok)* | Savunma yapılarına uygulanmaz. |
| **İçgüdü** | *(Etkisi Yok)* | Savunma yapılarına uygulanmaz. |

> [!NOTE]
> **Zırh ve Taş Ustalığı Ayrımı:** Dikkat ederseniz Zırh tekniği bazı binalara (Tuzak, Kazancı, Muhafız) saldırı/savunma verirken, Taş Ustalığı diğer ağır taş binalara (Kule, Mangonel, Balista) saldırı/savunma vermektedir. Her ikisi de aynı %6 oranını sağlar.

> [!WARNING]
> **Oyun Mekaniği İstisnası:** `mobiwar-engine.js` dosyasında da doğrulandığı üzere, Zırh ve Taş Ustalığı teknikleri yapıların sadece zırhını (savunmasını) değil, aynı zamanda **Fiziksel Saldırı** gücünü de %6 artırmaktadır. Bu, oyunun kodlanması sırasındaki ilginç bir tasarım tercihidir.
