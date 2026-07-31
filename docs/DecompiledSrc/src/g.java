import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import javax.microedition.io.Connector;
import javax.microedition.io.SocketConnection;
import javax.microedition.lcdui.Graphics;
import javax.microedition.rms.RecordStore;
import javax.microedition.rms.RecordStoreFullException;
import javax.microedition.rms.RecordStoreNotFoundException;

public final class g {
   private o[] a;
   private int b = 0;
   private k a = null;
   private RecordStore a;
   private RecordStore b;
   private h a;
   private h b;
   private int c;
   private int d;
   private boolean a = false;
   public o a;
   public int a;
   private o b = null;
   private static o[] b;
   private static StringBuffer a = new StringBuffer();
   private String a;
   private boolean b = false;
   public static String[] a = new String[]{"Giriþ", "Kayýt", "Beni Hatýrla", "Çýkýþ", "Þehir Terk Et", "Þehir Adý Deðiþtir", "Tatil Moduna Al", "Tatil Modundan Çýk", "Üyelik Iþlemleri", "Yardým", "Üret", "Yapýmý Durdur", "Bilgi", "Þehir Kur", "Hepsini Seç", "Mesajlar", "Genel Durum", "Ittifak", "Arama", "Baraka", "Yapýlar", "Savunma", "Akademi", "Dünya", "Komuta Merkezi", "Seçenekler", "Mesaj", "Ittifaða Davet", "Ittifak Yarat", "Ittifak Durum", "Üyeler", "Ittifaða Mesaj", "Ittifaðý Daðýt", "Ilerlet", "Ilerletmeyi Durdur", "Görev", "Görev Iptal", "Maðara Rapor", "Doldur", "Boþalt", "Göster", "Cevapla", "Sil", "Kabul", "Red", "Ittifaktan Çýkar", "Liderlik Devri", "Konseye Al", "Gelen Ordu", "Uyarý", ".Liste", "Ordu Görev", "Ordu Oluþtur", "Þifre Deðiþtir", "Kahramanlar", "Dirilt", "Diriltmeyi Durdur", "Adýný Deðiþtir", "Seviye Arttýr", "Kahraman Adý Deðiþtir", "Özellikler", "seviye ilerletme hakkýnýz var", "Kahraman Diriltme", "Sýralamalar", "Oyuncuya Göre", "Ittifaða Göre", "Kahramana Göre", "Oyuncu Ara", "Ittifak Ara", "Ittifaktan Ayrýl", "Sadece Mesajlar", "Sadece Raporlar", "Hepsini Göster", "Tüm Mesajlar", "Raporlar", "Boyut Atlat", "Ittifak Bilgi", "Ittifak Baþvuru", "Ittifak Metni", "Ordular", "Konseyden Çýkar", "Aylýk Sýnýrsýz Kullaným Al", "Üyelik Bilgileri", "Ittifak Adý Deðiþtir", "Þifre Hatýrlat", "Ekstra Paket Al", "Müzik", "Þikayet Et", "Dünyada Bul", "Arkadaþýna Tavsiye Et", "Oyuncuyu Blokla", "Bloklamayý Kaldýr"};

   public g(k var1) {
      this.a = var1;
      this.a = new o[15];
      b = new o[15];
      this.b = 0;
      if (this.a()) {
         this.a(-100);
      } else {
         this.a(33);
      }
   }

   private o a() {
      int var1;
      for(var1 = 0; var1 < b.length; ++var1) {
         if (b[var1] == null) {
            b[var1] = new o(this.a);
            break;
         }

         if (!b[var1].b) {
            break;
         }
      }

      b[var1].b = true;
      return b[var1];
   }

   private void a(o var1) {
      if (this.b == this.a.length) {
         o[] var2 = new o[this.b + 4];
         System.arraycopy(this.a, 0, var2, 0, this.b);
         this.a = var2;
      }

      this.a[this.b] = var1;
      ++this.b;
   }

   public final void a(Graphics var1) {
      if (this.a) {
         this.b();
         this.a = false;
      }

      int var2 = this.b - 1;
      int var3 = 0;
      int var4 = 0;

      for(boolean var5 = false; var2 >= 0; --var2) {
         if (this.a[var2].a) {
            var3 = var2;
            this.c = this.a[var2].b;
            this.a = this.a[var2];
            break;
         }

         if (this.a[var2].a == 5 && !var5) {
            var5 = true;
            var4 = this.a[var2].b;
         }
      }

      boolean var6 = false;
      if (this.b == this.a[this.b - 1]) {
         var1.translate(0 - var1.getTranslateX(), 0 - var1.getTranslateY());
         var1.setClip(0, 0, this.a.b, this.a.c);
         this.a[this.b - 1].a(var1);
      } else {
         for(int var7 = var3; var7 < this.b; ++var7) {
            var1.translate(0 - var1.getTranslateX(), 0 - var1.getTranslateY());
            var1.setClip(0, 0, this.a.b, this.a.c);
            if (this.a[var7].a == 5 && var4 == this.a[var7].b) {
               this.a[var7].a(var1);
            } else if (this.a[var7].a != 5 || this.a[var7].b == -1) {
               this.a[var7].a(var1);
            }
         }
      }

      this.b = this.a[this.b - 1];
      int var8;
      if ((var8 = this.a[this.b - 1].b) == 1 || var8 == 2 || var8 == 23 || var8 == 24 || var8 == 25 || var8 == -2 || var8 == 91 || var8 == 93 || var8 == -100) {
         this.a.a(this.a[this.b - 1]);
         var6 = true;
      }

      if (!var6) {
         this.a.a((o)null);
      }

   }

   public final void a(int var1) {
      o var2;
      n var4 = (var2 = this.a[this.b - 1]).a;
      a.setLength(0);
      this.d = -1;
      this.a.a.a = 1;
      if (var2.b == -100) {
         this.a();
         this.a(-1);
      } else {
         if (var2.b == 90 && (var1 == -5 || var1 == -6)) {
            this.a();
            var4 = (var2 = this.a[this.b - 1]).a;
         }

         if (var2.b == 18) {
            if (var1 == -3) {
               this.a();
               this.a();
               this.a[this.b - 1].a.b(-1);
               int var6 = (Integer)this.a[this.b - 1].a.a(-5).a(k.a[50]);
               var2 = this.a(var6);
               var1 = -5;
               var4 = var2.a;
            }

            if (var1 == -4) {
               this.a();
               this.a();
               this.a[this.b - 1].a.a(-2);
               int var35 = (Integer)this.a[this.b - 1].a.a(-5).a(k.a[50]);
               var2 = this.a(var35);
               var1 = -5;
               var4 = var2.a;
            }
         }

         if (var1 == -7) {
            this.a = null;
            if (var2.a != 1 && var2.b != -1) {
               this.a();
            }
         } else {
            switch (var2.a) {
               case 1:
                  if (var1 == -2) {
                     var4.a(var1);
                  } else if (var1 == -1) {
                     var4.b(var1);
                  } else if (var1 == -3) {
                     var4.d(var1);
                  } else if (var1 == -4) {
                     var4.c(var1);
                  } else if (var1 != -6 && var1 != -5) {
                     if (var1 == 35) {
                        this.d = 22;
                     } else if (var1 == 42) {
                        this.d = 10;
                     } else {
                        var4.e(var1);
                     }
                  } else {
                     this.a = var4.a(var1);
                     this.d = (Integer)this.a.a(k.a[50]);
                     this.a.a();
                  }
                  break;
               case 2:
                  if (var1 != -6 && var1 != -5) {
                     if (var1 == -2) {
                        var4.a(var1);
                     } else if (var1 == -1) {
                        var4.b(var1);
                     } else if (var1 == -3) {
                        var4.d(var1);
                     } else if (var1 == -4) {
                        var4.c(var1);
                     } else if (var1 == 35) {
                        this.d = 22;
                     } else if (var1 == 35) {
                        if (var2.b != 25 && var2.b != 32) {
                           this.d = 22;
                        }
                     } else {
                        var4.e(var1);
                     }
                  } else {
                     this.a = var4.a(var1);
                     if (this.a != null) {
                        this.d = (Integer)this.a.a(k.a[50]);
                     }

                     if (this.d == -99) {
                        this.a();
                     }

                     if (this.d == 68) {
                        if (this.a(a.append(k.a[66]).append(this.a.a[0]).append("&r=1").append(k.a[262]).append(this.a.o), 8)) {
                           this.a();
                           this.d = 32;
                        }
                     } else if (this.d == 69) {
                        if (this.a(a.append(k.a[66]).append(this.a.a[0]).append("&l=1").append(k.a[262]).append(this.a.o), 8)) {
                           this.a();
                           this.d = 32;
                        }
                     } else if (this.d == 70) {
                        if (this.a(a.append(k.a[66]).append(this.a.a[0]).append(k.a[262]).append(this.a.o), 8)) {
                           this.a();
                           this.d = 32;
                        }
                     } else if (this.d == 29) {
                        if (this.a(a.append(k.a[61]).append(this.a.c.a(k.a[53]).a(k.a[54]).a(k.a[170])).append("&l=1"), 3)) {
                           this.a();
                           this.d = 31;
                        }
                     } else if (this.d == 30) {
                        if (this.a(a.append(k.a[61]).append(this.a.c.a(k.a[53]).a(k.a[54]).a(k.a[170])).append("&r=1"), 3)) {
                           this.a();
                           this.d = 31;
                        }
                     } else if (this.d == 31 && this.a(a.append(k.a[61]).append(this.a.c.a(k.a[53]).a(k.a[54]).a(k.a[170])), 3)) {
                        this.a();
                        this.d = 31;
                     }

                     if (this.d == 131) {
                        if (this.a(a.append(k.a[64]).append(this.a.a[0]).append("&r=1"), 6)) {
                           this.a();
                           this.d = 20;
                        }
                     } else if (this.d == 132) {
                        if (this.a(a.append(k.a[64]).append(this.a.a[0]).append("&l=1"), 6)) {
                           this.a();
                           this.d = 20;
                        }
                     } else if (this.d == 133) {
                        if (this.a(a.append(k.a[64]).append(this.a.a[0]), 6)) {
                           this.a();
                           this.d = 20;
                        }
                     } else {
                        short var34;
                        if (this.a.f == 1) {
                           var34 = 251;
                        } else if (this.a.f == 2) {
                           var34 = 250;
                        } else {
                           var34 = 248;
                        }

                        if (this.d == 107) {
                           this.a(a.append(k.a[var34]).append(this.a.a[0]).append("&r=1"), 47);
                        } else if (this.d == 108) {
                           this.a(a.append(k.a[var34]).append(this.a.a[0]).append("&l=1"), 47);
                        } else if (this.d == 109) {
                           this.a(a.append(k.a[var34]).append(this.a.a[0]), 47);
                        }

                        if (this.b && this.d > 106 && this.d < 110) {
                           this.d = 102;
                           this.a();
                        }
                     }
                  }
               case 3:
               case 8:
               default:
                  break;
               case 4:
                  if (var1 != -5 && var1 != -6) {
                     if (var1 == -2) {
                        var4.a(var1);
                     } else if (var1 == -1) {
                        var4.b(var1);
                     } else {
                        this.a.a.b = null;
                        var4.e(var1);
                        if (this.a.a.b != null) {
                           this.d = 33;
                        }
                     }
                  } else if (var1 == 53) {
                     var4.a(var1);
                  } else {
                     this.a = var4.a(var1);
                     this.a.d = this.a;
                     this.d = 9;
                  }
                  break;
               case 5:
                  if (var1 != -5 && var1 != -6) {
                     if (var1 == -2) {
                        var4.a(var1);
                     } else if (var1 == -1) {
                        var4.b(var1);
                     }
                  } else {
                     this.a = var4.a(var1);
                     if (this.a != null) {
                        this.d = (Integer)this.a.a(k.a[50]);
                        if (var2.b == 22) {
                           if (this.c == 116) {
                              this.a.f = this.a.a.a(((p)var4).e);
                              this.d = 13;
                              this.a();
                           } else {
                              this.a.c(((p)var4).e);
                              this.a();
                              if (this.c != 1) {
                                 this.d = this.c;
                                 this.a = true;
                              } else {
                                 this.d = 1000;
                              }
                           }
                        }

                        if (this.d == -20) {
                           this.a.t = ((Integer)this.a.a(k.a[36]) + 1) % 2;
                           this.a(1, String.valueOf(this.a.t));
                           this.a.a((Object)(new Integer(this.a.t)), (String)k.a[36]);
                           if (this.a.t == 0) {
                              this.a(2, k.a[222]);
                              this.a(3, k.a[222]);
                              this.a(4, k.a[222]);
                              this.a.c = k.a[222];
                              this.a.d = k.a[222];
                              this.a.e = k.a[222];
                           }
                        } else if (this.d != -2 && this.d != -3 && this.d != -6) {
                           if (this.d == 2) {
                              if (this.a.b().a(k.a[19]) == null) {
                                 this.a(a.append(k.a[60]).append(this.a.a()), 2);
                              }
                           } else if (this.d == 6) {
                              if (!((i)this.a.a.a.a.a).c()) {
                                 this.d = 33;
                                 this.a.a.b = "Önce üretmek istediðin ünite sayýlarýný girmelisin !";
                              } else if (this.a(a.append(k.a[174]).append(this.a.a()).append(this.a.d.a(k.a[173])), 26)) {
                                 a.setLength(0);
                                 this.d = this.c;
                                 if (this.d == 23) {
                                    this.a(a.append(k.a[71]).append(this.a.a()), 12);
                                 } else if (this.d == 24) {
                                    this.a(a.append(k.a[68]).append(this.a.a()), 10);
                                 } else if (this.d == 25) {
                                    this.a(a.append(k.a[69]), 11);
                                 } else if (this.d == 2) {
                                    this.a(a.append(k.a[60]).append(this.a.a()), 2);
                                 }

                                 if (this.b) {
                                    this.a();
                                    this.a();
                                 }

                                 k.c = true;
                              }
                           } else if (this.d != 116 && (this.d <= 35 || this.d >= 41) && this.d != 4) {
                              if (this.d == 23) {
                                 if (this.a.b().a(k.a[179]) == null) {
                                    this.a(a.append(k.a[71]).append(this.a.a()), 12);
                                 }
                              } else if (this.d == 24) {
                                 if (this.a.b().a(k.a[143]) == null) {
                                    this.a(a.append(k.a[68]).append(this.a.a()), 10);
                                 }
                              } else if (this.d == 25) {
                                 if (this.a.g.a(k.a[161]) == null) {
                                    this.a(a.append(k.a[69]), 11);
                                 }
                              } else if (this.d == 7) {
                                 if (var2.b == 94) {
                                    this.a(a.append(k.a[59]).append(13).append(k.a[168]).append(this.a.a()), 1);
                                 } else if (var2.b == 97) {
                                    this.a(a.append(k.a[59]).append(k.a[123]).append(this.a.b.a(k.a[162])).append(k.a[168]).append(this.a.a()), 1);
                                 } else {
                                    this.a(a.append(k.a[59]).append(this.a.b.a(k.a[162])).append(k.a[168]).append(this.a.a()), 1);
                                 }

                                 if (this.b) {
                                    this.d = 18;
                                 }
                              } else if (this.d == 19) {
                                 if ((Integer)this.a.b.a(k.a[26]) == 1) {
                                    if (this.a(a.append(k.a[67]).append(this.a.a()).append(k.a[121]).append(this.a.b.a[2]), 9)) {
                                       this.d = 18;
                                    }
                                 } else if (this.a(a.append(k.a[63]).append(this.a.b.a(k.a[78]) + k.a[121] + this.a.b.a[2]), 5)) {
                                    this.d = 66;
                                 }
                              } else if (this.d == 3) {
                                 this.a(a.append(k.a[61]).append(this.a.a()), 3);
                              } else if (this.d == 32) {
                                 this.a.o = 0;
                                 if (this.a(a.append(k.a[66]).append(k.a[188]), 8)) {
                                    this.a.n = 0;
                                 }
                              } else if (this.d == 34) {
                                 if (this.a(a.append(k.a[174]).append(this.a.a()).append(k.a[142]).append(this.a.b.a(k.a[162])).append(k.a[5]).append(k.a[188]), 26)) {
                                    a.setLength(0);
                                    this.d = this.c;
                                    if (this.d == 23) {
                                       this.a(a.append(k.a[71]).append(this.a.a()), 12);
                                    } else if (this.d == 24) {
                                       this.a(a.append(k.a[68]).append(this.a.a()), 10);
                                    } else if (this.d == 25) {
                                       this.a(a.append(k.a[69]), 11);
                                    }

                                    if (this.b) {
                                       this.a();
                                       this.a();
                                    }

                                    k.c = true;
                                 }
                              } else if (this.d == 35) {
                                 if (this.a(a.append(k.a[94]).append(this.a.a()).append(k.a[160]).append(k.a[5]).append(this.a.b.a(k.a[162])), 14)) {
                                    a.setLength(0);
                                    this.d = this.c;
                                    if (this.d == 23) {
                                       this.a(a.append(k.a[71]).append(this.a.a()), 12);
                                    } else if (this.d == 24) {
                                       this.a(a.append(k.a[68]).append(this.a.a()), 10);
                                    } else if (this.d == 25) {
                                       this.a(a.append(k.a[69]), 11);
                                    } else if (this.d == 2) {
                                       this.a(a.append(k.a[60]).append(this.a.a()), 2);
                                    }

                                    if (this.b) {
                                       this.a();
                                       this.a();
                                    }

                                    k.c = true;
                                 }
                              } else if (this.d == 47) {
                                 if (this.a(a.append(k.a[209]).append(this.a.a()).append(k.a[121]).append(this.a.b.a[2]), 32)) {
                                    this.a();
                                 }
                              } else if (this.d == 67) {
                                 if (this.a(a.append(k.a[93]).append(this.a.a()), 13)) {
                                    this.a();
                                 }
                              } else if (this.d == 50) {
                                 String var30 = ((i)this.a.a).a();
                                 if (this.a(a.append(k.a[153]).append(var30).append(k.a[142]).append(k.a[5]).append(((i)this.a.a).b).append(k.a[262]).append(this.a.o), 8)) {
                                    this.a();
                                    this.a();
                                    this.d = 32;
                                 }
                              } else if (this.d == 126) {
                                 ((i)this.a.a).b().a.setLength(1);
                                 String var31 = ((i)this.a.a).a();
                                 if (this.a(a.append(k.a[153]).append(var31).append(k.a[142]).append(k.a[5]).append(((i)this.a.a).b).append(k.a[262]).append(this.a.o), 8)) {
                                    this.a();
                                    this.a();
                                    this.d = 32;
                                 }
                              } else if (this.d == 18) {
                                 if (this.a(a.append(k.a[65]).append(this.a.b.a(k.a[119])).append(k.a[160]).append(k.a[5]).append(this.a.b.a(k.a[162])), 7)) {
                                    this.a.b.a((Object)k.a[188], (String)k.a[110]);
                                    ((i)this.a.a).b().a = 84;
                                 }
                              } else if (this.d == 51) {
                                 if (this.a == null) {
                                    this.a = "Oyuncuya ittifak daveti gönderilecek. Emin misiniz!";
                                    this.d = 90;
                                 } else if (this.a(a.append(k.a[97]).append(this.a.b.a(k.a[123])), 17)) {
                                    this.a();
                                 }
                              } else if (this.d != 121 && this.d != 122) {
                                 if (this.d == 52) {
                                    if (this.a(a.append(k.a[98]).append(this.a.b.a(k.a[119])), 18)) {
                                       this.a();
                                       this.a();
                                       this.a.q = 1;
                                       this.d = 32;
                                    }
                                 } else if (this.d == 125) {
                                    if (this.a(a.append(k.a[277]).append(this.a.b.a(k.a[119])), 18)) {
                                       this.a();
                                       this.a();
                                       this.d = 32;
                                    }
                                 } else if (this.d == 53) {
                                    if (this.a == null) {
                                       this.a = "Kendi ittifaðýnýz daðýtýlacak. Emin misiniz!";
                                       this.d = 90;
                                    } else if (this.a(a.append(k.a[95]), 15)) {
                                       this.a.q = 0;
                                       this.a();
                                    }
                                 } else if (this.d == 20) {
                                    this.a(a.append(k.a[64]).append(k.a[188]), 6);
                                 } else if (this.d == 55) {
                                    if (this.a == null) {
                                       this.a = "Oyuncu ittifaktan çýkarýlacak. Emin misiniz!";
                                       this.d = 90;
                                    } else if (this.a(a.append(k.a[100]).append(this.a.b.a(k.a[123])), 20)) {
                                       this.a();
                                       this.a();
                                       this.d = 20;
                                    }
                                 } else if (this.d == 56) {
                                    if (this.a == null) {
                                       this.a = "Oyuncu konsey üyesi yapýlacak. Emin misiniz!";
                                       this.d = 90;
                                    } else if (this.a(a.append(k.a[101]).append(this.a.b.a(k.a[123])), 21)) {
                                       a.setLength(0);
                                       if (this.a(a.append(k.a[64]).append(this.a.a[0]), 6)) {
                                          this.a();
                                          this.a();
                                          this.d = 20;
                                       }
                                    }
                                 } else if (this.d == 130) {
                                    if (this.a == null) {
                                       this.a = "Oyuncu konseyden çýkarýlacak. Emin misiniz!";
                                       this.d = 90;
                                    } else if (this.a(a.append(k.a[284]).append(this.a.b.a(k.a[123])), 0)) {
                                       a.setLength(0);
                                       if (this.a(a.append(k.a[64]).append(this.a.a[0]), 6)) {
                                          this.a();
                                          this.a();
                                          this.d = 20;
                                       }
                                    }
                                 } else if (this.d == 57) {
                                    if (this.a == null) {
                                       this.a = "Ittifak liderliðinizi devir ediyorsunuz. Emin misiniz!";
                                       this.d = 90;
                                    } else if (this.a(a.append(k.a[99]).append(this.a.b.a(k.a[123])), 19)) {
                                       a.setLength(0);
                                       if (this.a(a.append(k.a[64]).append(this.a.a[0]), 6)) {
                                          this.a();
                                          this.a();
                                          this.d = 20;
                                          this.a.q = 2;
                                       }
                                    }
                                 } else if (this.d == 59) {
                                    this.a(a.append(k.a[96]), 16);
                                 } else if (this.d != 118 && this.d != 123) {
                                    if (this.d == 128) {
                                       this.a(a.append(k.a[282]), 16);
                                    } else if (this.d == 129) {
                                       this.a(a.append(k.a[283]), 16);
                                    } else if (this.d == 139) {
                                       if (this.a == null) {
                                          this.a = "Bu mesajý MobiWar adminlerine þikayet ediyorsunuz. Emin misiniz!";
                                          this.d = 90;
                                       } else if (this.a(a.append(k.a[295]).append(this.a.b.a(k.a[119])), 59)) {
                                          this.d = 33;
                                       }
                                    } else if (this.d == 143) {
                                       if (this.a == null) {
                                          this.a = "Bu mesajý gönderen oyuncudan bundan sonra gelecek tüm mesajlarý engelliyorsunuz. Emin misiniz!";
                                          this.d = 90;
                                       } else if (this.a(a.append(k.a[297]).append("m=").append(this.a.b.a(k.a[119])), 61)) {
                                          this.d = 33;
                                       }
                                    } else if (this.d == 144) {
                                       if (this.a == null) {
                                          this.a = "Bu oyuncudan bundan sonra gelecek tüm mesajlarý engelliyorsunuz. Emin misiniz!";
                                          this.d = 90;
                                       } else if (this.a(a.append(k.a[297]).append("o=").append(this.a.b.a(k.a[123])), 61)) {
                                          this.d = 33;
                                       }
                                    } else if (this.d == 145) {
                                       if (this.a == null) {
                                          this.a = "Bu oyuncudan gönderilen mesajlarý bundan sonra alabileceksiniz. Emin misiniz!";
                                          this.d = 90;
                                       } else if (this.a(a.append(k.a[297]).append("ok=").append(this.a.b.a(k.a[123])), 61)) {
                                          this.d = 33;
                                       }
                                    } else if (this.d == 60) {
                                       this.a(a.append(k.a[62]), 4);
                                    } else if (this.d == 65) {
                                       this.a.a = true;
                                    } else if (this.d == 61) {
                                       if (this.a == null) {
                                          this.a = "Þehri terk ediyorsunuz. Emin misiniz!";
                                          this.d = 90;
                                       } else if (this.a(a.append(k.a[165]).append(this.a.a()), 24)) {
                                          int var32 = this.a.a.a(this.a.a());
                                          this.a.c(0);
                                          this.a.a.a(var32);
                                          this.a();
                                       }
                                    } else if (this.d == 64) {
                                       if (this.a == null) {
                                          if (this.a.s == 1) {
                                             this.a = "Hesabýnýz tatil modundan çýkacak. Emin misiniz!";
                                          } else {
                                             this.a = "Hesabýnýz tatil moduna alýnacak. Emin misiniz!";
                                          }

                                          this.d = 90;
                                       } else if (this.a(a.append(k.a[167]).append((this.a.s + 1) % 2), 25)) {
                                          this.a.s = (this.a.s + 1) % 2;
                                          this.a();
                                       }
                                    } else if (this.d == 136) {
                                       if (this.a == null) {
                                          this.a = "MobiWar Ekstra paket alýyorsunuz. Emin misiniz!";
                                          this.d = 90;
                                       } else if (this.a(a.append(k.a[290]).append(2), 56)) {
                                          this.a(33);
                                       }
                                    } else if (this.d == 137) {
                                       if (this.a == null) {
                                          this.a = "Aylýk sýnýrsýz kullaným paketi alýyorsunuz. Emin misiniz!";
                                          this.d = 90;
                                       } else if (this.a(a.append(k.a[290]).append(1), 56)) {
                                          this.a(33);
                                       }
                                    } else if (this.d == 93) {
                                       this.a(a.append(k.a[229]).append(this.a.a()), 42);
                                    } else if (this.d == 96) {
                                       this.a(a.append(k.a[242]).append(this.a.b.a(k.a[162])).append(k.a[168]).append(this.a.a()), 44);
                                    } else if (this.d == 98) {
                                       if (this.a(a.append(k.a[244]).append(this.a.e.a(k.a[162])).append(k.a[121]).append(this.a.b.a(k.a[162])).append(k.a[168]).append(this.a.a()), 45)) {
                                          int var33 = Integer.parseInt(this.a.e.a(k.a[178]));
                                          this.a.e.a((Object)String.valueOf(var33 - 1), (String)k.a[178]);
                                          this.a();
                                          this.a();
                                          this.d = 96;
                                       }
                                    } else if (this.d == 100) {
                                       if (this.a(a.append(k.a[245]).append(this.a.b.a(k.a[162])).append(k.a[121]).append(2).append(k.a[168]).append(this.a.a()), 46)) {
                                          this.a();
                                          this.a();
                                          this.d = 93;
                                       }
                                    } else if (this.d == 103) {
                                       this.a.f = 1;
                                       if (this.a(a.append(k.a[251]).append(-1), 47)) {
                                          this.d = 102;
                                       }
                                    } else if (this.d == 104) {
                                       this.a.f = 3;
                                       if (this.a(a.append(k.a[248]).append(-1), 47)) {
                                          this.d = 102;
                                       }
                                    } else if (this.d == 105) {
                                       this.a.f = 2;
                                       if (this.a(a.append(k.a[250]).append(1), 47)) {
                                          this.d = 102;
                                       }
                                    } else if (this.d == 110) {
                                       if (this.a == null) {
                                          this.a = "Ittifaðý terk ediyorsunuz. Emin misiniz!";
                                          this.d = 90;
                                       } else if (this.a(a.append(k.a[255]), 49)) {
                                          this.a.q = 0;
                                          this.a();
                                       }
                                    } else if (this.d == 112) {
                                       this.a.o = 2;
                                       if (this.a(a.append(k.a[66]).append(k.a[188]).append(k.a[262]).append(this.a.o), 8)) {
                                          this.a();
                                          this.a();
                                          this.d = 32;
                                       }
                                    } else if (this.d == 113) {
                                       this.a.o = 1;
                                       if (this.a(a.append(k.a[66]).append(k.a[188]).append(k.a[262]).append(this.a.o), 8)) {
                                          this.a();
                                          this.a();
                                          this.d = 32;
                                       }
                                    } else if (this.d == 114) {
                                       this.a.o = 0;
                                       if (this.a(a.append(k.a[66]).append(k.a[188]).append(k.a[262]).append(this.a.o), 8)) {
                                          this.a();
                                          this.a();
                                          this.d = 32;
                                       }
                                    } else if (this.d == 127) {
                                       if (this.a(a.append(k.a[107]), 22)) {
                                          this.a();
                                       }
                                    } else if (this.d == 13) {
                                       this.a.y = Integer.parseInt(((i)this.a.a).a.substring(1));
                                       if (this.a.f != null) {
                                          if (this.a.y == 14) {
                                             this.a(a.append(k.a[208]).append(this.a.a()).append(k.a[160]).append(k.a[5]).append(this.a.y).append("&h=").append(this.a.f.a(0).a(k.a[135])).append(this.a.d.a(k.a[173])), 53);
                                          } else {
                                             this.a(a.append(k.a[208]).append(this.a.a()).append(k.a[160]).append(k.a[5]).append(this.a.y).append("&h=").append(this.a.f.a(k.a[135])).append(this.a.d.a(k.a[173])), 31);
                                          }
                                       } else {
                                          this.a(a.append(k.a[208]).append(this.a.a()).append(k.a[160]).append(k.a[5]).append(this.a.y).append(this.a.d.a(k.a[173])), 31);
                                       }
                                    } else if (this.d == 141) {
                                       if (this.a(a.append(k.a[298]).append(this.a.b.a(k.a[123])), 3)) {
                                          this.a();
                                          this.a();
                                          this.d = 31;
                                       }
                                    } else if (this.d != 42 && this.d != 43 && this.d != 45 && this.d != 46) {
                                       if (this.d == 124) {
                                          this.a(a.append(k.a[273]), 7);
                                       }
                                    } else {
                                       this.b = true;
                                       a.setLength(0);
                                       if (this.a.b().a(k.a[19]) == null) {
                                          this.a(a.append(k.a[60]).append(this.a.a()), 2);
                                       }

                                       a.setLength(0);
                                       if (this.b && this.a.b().a(k.a[103]) == null) {
                                          this.a(a.append(k.a[229]).append(this.a.a()), 42);
                                       }

                                       if (this.b) {
                                          this.a.e = this.a.b().a(k.a[103]);
                                       }
                                    }
                                 } else {
                                    if (this.d == 118) {
                                       this.a(a.append(k.a[272]).append(this.a.b.a(k.a[14])), 16);
                                    } else {
                                       this.a(a.append(k.a[272]).append(this.a.b.a(k.a[123])), 16);
                                    }

                                    if (this.b) {
                                       this.d = 118;
                                    }
                                 }
                              } else if (this.a == null) {
                                 this.a = "Ittifaða baþvuru gönderilecek. Emin misiniz!";
                                 this.d = 90;
                              } else {
                                 if (this.d == 121) {
                                    this.a(a.append(k.a[271]).append(this.a.b.a(k.a[14])), 50);
                                 } else {
                                    this.a(a.append(k.a[271]).append(this.a.b.a(k.a[123])), 50);
                                 }

                                 if (this.b) {
                                    this.a();
                                 }
                              }
                           } else {
                              this.b = true;
                              if (this.a.b().a(k.a[19]) == null) {
                                 this.a(a.append(k.a[60]).append(this.a.a()), 2);
                                 a.setLength(0);
                              }

                              if (this.b && this.a.b().a(k.a[103]) == null) {
                                 this.a(a.append(k.a[229]).append(this.a.a()), 42);
                              }

                              if (this.b) {
                                 this.a.e = this.a.b().a(k.a[103]);
                              }
                           }
                        } else if (this.a == null && this.a.c.compareTo("") == 0) {
                           this.a = "MobiWar'a baðlanabilmek için cep telefonundaki Turkcell Servis baðlantý noktasýný kullanmalýsýn, baðlantý ayarýn yoksa AYAR yaz 7766'ya gönder !";
                           this.d = 90;
                        } else if (!this.a.b) {
                           String var29 = this.a.e;
                           this.a.e = "1";
                           if (this.a(a.append(k.a[279]), 0)) {
                              this.a.b = true;
                           } else {
                              this.d = 0;
                           }

                           this.a.e = var29;
                        }
                     }
                  }
                  break;
               case 6:
                  if (var1 != -5 && var1 != -6) {
                     if (var1 == -2) {
                        var4.a(var1);
                     } else if (var1 == -1) {
                        var4.b(var1);
                     } else if (var1 == -3) {
                        var4.d(var1);
                     } else if (var1 == -4) {
                        var4.c(var1);
                     } else {
                        var4.e(var1);
                     }
                  } else {
                     this.a = var4.a(var1);
                     if (var2.b == -2) {
                        String var20;
                        if ((var20 = ((StringBuffer)this.a.a("Gd").a(k.a[36])).toString()).length() != 0 && Integer.parseInt(var20) >= 1) {
                           this.a.e = var20;
                           a.append(k.a[291]);
                           a.append(var20);
                           if (this.a(a, 57)) {
                              a.setLength(0);
                              a.append(k.a[212]);
                              this.a.c = ((StringBuffer)this.a.a("Ga").a(k.a[36])).toString();
                              this.a.i = "socket://" + this.a.h.trim();
                              this.a(this.a);
                              a.append(k.a[42]);
                              if (this.a(a, 35)) {
                                 a.setLength(0);
                                 if (this.a(a.append(k.a[204]), 27)) {
                                    if (!this.a(0)) {
                                       this.d = 33;
                                    } else {
                                       for(int var37 = 0; var37 < this.b; ++var37) {
                                          this.a[var37].c();
                                       }

                                       this.b = 0;
                                       this.d = 1;

                                       try {
                                          if (this.a.t == 1) {
                                             this.a = RecordStore.openRecordStore(k.a[148], false);
                                             boolean var38;
                                             if (var38 = this.a(2, this.a.c)) {
                                                var38 = this.a(3, ((StringBuffer)this.a.a("Gs").a(k.a[227])).toString());
                                             }

                                             if (var38) {
                                                var38 = this.a(4, ((StringBuffer)this.a.a("Gd").a(k.a[36])).toString());
                                             }

                                             if (!var38) {
                                                this.d = 33;
                                                this.a.a.b = "Tercihler kaydedilemedi! Telefon hafýzasý dolmuþ olabilir.";
                                             }
                                          }
                                       } catch (Exception var17) {
                                       } finally {
                                          try {
                                             this.a.closeRecordStore();
                                          } catch (Exception var16) {
                                          }

                                       }

                                       this.a.u = 0;
                                    }
                                 }
                              } else {
                                 try {
                                    e.b();
                                 } catch (Exception var19) {
                                 }
                              }
                           }
                        } else {
                           this.d = 33;
                           this.a.a.b = "Dünya numarasý hatalý!";
                        }
                     } else if (var2.b == -3) {
                        int var21 = ((StringBuffer)this.a.a("Gs").a(k.a[36])).length();
                        int var39;
                        if ((var39 = ((StringBuffer)this.a.a("Ga").a(k.a[36])).length()) >= 3 && var39 <= 10) {
                           if (var21 >= 3 && var21 <= 8) {
                              this.b = new h(4);
                              this.b.a(this.a);
                              this.d = -4;
                           } else {
                              this.d = 33;
                              this.a.a.b = "Þifre en az 3 en fazla 8 karakter olmalý!";
                           }
                        } else {
                           this.d = 33;
                           this.a.a.b = "Oyuncu adý en az 3 en fazla 10 karakter olmalý!";
                        }
                     } else if (var2.b == -4) {
                        this.b.a(this.a);
                        a.append(k.a[207]);
                        this.a.e = String.valueOf(this.b.a("Gd").a(k.a[36]));
                        this.a(this.b);
                        if (this.a.e.length() != 0 && Integer.parseInt(this.a.e) >= 1 && Integer.parseInt(this.a.e) <= this.a.z) {
                           this.a(a.append(k.a[42]), 30);
                           this.d = -5;
                        } else {
                           this.d = 33;
                           this.a.a.b = "Dünya numarasý hatalý!";
                        }
                     } else if (var2.b == -6) {
                        a.append(k.a[289]);
                        this.a.e = String.valueOf(this.a.a("Gw").a(k.a[36]));
                        a.append(this.a.e).append("&p=1");
                        if (this.a.e.length() != 0 && Integer.parseInt(this.a.e) >= 1 && Integer.parseInt(this.a.e) <= this.a.z) {
                           if (this.a(a, 55)) {
                              this.a();
                              this.a(33);
                           }
                        } else {
                           this.d = 33;
                           this.a.a.b = "Dünya numarasý hatalý!";
                        }
                     } else if (var2.b == 15) {
                        StringBuffer var22;
                        k.a(var22 = (StringBuffer)this.a.a(k.a[136]), ' ', '|');
                        if (this.a(a.append(k.a[206]).append(var22), 29)) {
                           this.a();
                           this.d = 41;
                        }
                     } else if (var2.b == 13) {
                        if (this.a(a.append(k.a[210]).append(this.a.a()).append("&a=").append(this.a.a(1).a(k.a[36])).append("&y=").append(this.a.a(2).a(k.a[36])), 33)) {
                           this.a.b().a(this.a.b().a(k.a[19]));
                           this.a.b().a(this.a.b().a(k.a[103]));
                           this.a();
                           this.a();
                           this.a();
                        }
                     } else if (var2.b == 16) {
                        StringBuffer var23;
                        k.a(var23 = (StringBuffer)this.a.a(1).a(k.a[36]), ' ', '|');
                        if (this.a(a.append(k.a[213]).append(var23), 36)) {
                           this.a.q = 3;
                           this.a();
                           this.a();
                        }
                     } else if (var2.b == 142) {
                        StringBuffer var24 = (StringBuffer)this.a.a(1).a(k.a[36]);
                        if (this.a(a.append(k.a[296]).append(var24), 60)) {
                           this.d = 33;
                        }
                     } else if (var2.b == 62) {
                        StringBuffer var25;
                        k.a(var25 = (StringBuffer)this.a.a(1).a(k.a[36]), ' ', '|');
                        if (this.a(a.append(k.a[214]).append(var25).append(k.a[168]).append(this.a.a()), 37)) {
                           this.a.b().a(0).a((Object)var25.toString(), (String)k.a[189]);
                           this.a();
                           this.a();
                        }
                     } else if (var2.b == 91) {
                        if (this.a(a.append(k.a[228]).append((StringBuffer)this.a.a(1).a(k.a[36])).append('&').append(k.a[180]).append(k.a[5]).append((StringBuffer)this.a.a(2).a(k.a[36])).append(k.a[261]).append((StringBuffer)this.a.a(3).a(k.a[36])), 41)) {
                           this.a();
                           this.a();
                        }
                     } else if (var2.b == 95) {
                        StringBuffer var26;
                        k.a(var26 = (StringBuffer)this.a.a(1).a(k.a[36]), ' ', '|');
                        if (this.a(a.append(k.a[241]).append(var26).append(k.a[261]).append(this.a.b.a(k.a[162])).append(k.a[168]).append(this.a.a()), 43)) {
                           this.a();
                           this.a();
                           this.a();
                           this.d = 93;
                        }
                     } else if (var2.b == 108) {
                        StringBuffer var27;
                        k.a(var27 = (StringBuffer)this.a.a(1).a(k.a[36]), ' ', '|');
                        if (this.a(a.append(k.a[254]).append(var27), 29)) {
                           this.a();
                           this.d = 111;
                        }
                     } else if (var2.b == 135) {
                        StringBuffer var28;
                        k.a(var28 = (StringBuffer)this.a.a(1).a(k.a[36]), ' ', '|');
                        if (this.a(a.append(k.a[286]).append(var28), 53)) {
                           this.a();
                        }
                     }
                  }
                  break;
               case 7:
                  if (var1 != -6 && var1 != -5) {
                     if (var1 == -2) {
                        var4.a(var1);
                     } else if (var1 == -1) {
                        var4.b(var1);
                     } else if (var1 == -3) {
                        var4.d(var1);
                     } else if (var1 == -4) {
                        var4.c(var1);
                     }
                  } else {
                     if (var2.b == 21) {
                        this.a.a = true;
                     } else if (var2.b == -5) {
                        if (this.b) {
                           this.a();
                           this.a();
                        } else {
                           this.a();
                        }
                     }

                     if (var2.b == 13 && this.a(a.append(k.a[210]).append(this.a.a()), 33)) {
                        this.a.b().a(this.a.b().a(k.a[19]));
                        this.a.b().a(this.a.b().a(k.a[103]));
                        if (this.a.y == 14) {
                           this.a.f.a(this.a.f.a(k.a[19]));
                           this.a.f.a(this.a.f.a(k.a[103]));
                        }

                        this.a();
                        this.a();
                        if (this.a.b().a(k.a[179]) != null) {
                           this.a.b().a(k.a[179]).a[0] = (long)this.a.u;
                        }
                     }

                     if (var2.b == 99) {
                        if (this.a(a.append(k.a[245]).append(this.a.b.a(k.a[162])).append(k.a[121]).append(1).append(k.a[168]).append(this.a.a()), 46)) {
                           this.a();
                           this.a();
                           this.a();
                           this.d = 93;
                        }
                     } else if (var2.b == 33 && this.a.a.b != null && this.a.a.b.startsWith("Login gerekli")) {
                        this.a.a = true;
                     } else {
                        this.a();
                     }
                  }
                  break;
               case 9:
                  if (var1 != -5 && var1 != -6) {
                     if (var1 == -2) {
                        var4.a(var1);
                     } else if (var1 == -1) {
                        var4.b(var1);
                     } else if (var1 == -3) {
                        var4.d(var1);
                     } else if (var1 == -4) {
                        var4.c(var1);
                     } else {
                        var4.e(var1);
                     }
                  } else {
                     this.a = var4.a(var1);
                     if (this.a != null) {
                        if (this.a == null) {
                           if (var2.b == 124) {
                              this.a = "Ittifak metini deðiþitirilecek. Emin misiniz!";
                           } else {
                              this.a = "Mesaj gönderilecek. Emin misiniz!";
                           }

                           this.d = 90;
                        } else {
                           StringBuffer var5 = (StringBuffer)this.a.a(k.a[53]).a(k.a[36]);
                           StringBuffer var36;
                           (var36 = new StringBuffer()).append(var5);
                           k.a(var36, ' ', '/');
                           if (var2.b == 14) {
                              this.a(a.append(k.a[215]).append(var36).append(k.a[121]).append(this.a.b.a(k.a[123])).append("&t=6"), 38);
                           } else if (var2.b == 58) {
                              this.a(a.append(k.a[216]).append(var36), 39);
                           } else if (var2.b == 124) {
                              this.a(a.append(k.a[275]).append(var36), 39);
                           }

                           if (this.b) {
                              this.a();
                              if (this.a.a(k.a[149]) != null && (Integer)this.a.a(k.a[149]) == 0) {
                                 this.a();
                              }
                           }
                        }
                     }
                  }
            }
         }

         if (this.d != -1 && this.d != 1000 && this.a.a.a == 1) {
            this.a(this.d);
         }

      }
   }

   private void a() {
      if (this.a[this.b - 1].b == 18) {
         this.a.d.a();
      }

      if (this.a[this.b - 1].a == 5) {
         ((p)this.a[this.b - 1].a).a.a();
      }

      this.a[this.b - 1].c();
      this.a[this.b - 1] = null;
      --this.b;
      if (this.b > 0) {
         this.a.k = this.a[this.b - 1].c;
      }

   }

   private void b() {
      this.a[this.b - 2].c();
      this.a[this.b - 2] = this.a[this.b - 1];
      this.a[this.b - 1] = null;
      --this.b;
   }

   private o a(int var1) {
      a.setLength(0);
      String var2 = null;
      o var5 = null;
      if (var1 != 44 && var1 != -20 && var1 != 138) {
         (var5 = this.a()).b = var1;
      }

      h var3 = new h(10);
      switch (var1) {
         case -100:
            this.a(var5);
         case -99:
         case -98:
         case -97:
         case -96:
         case -95:
         case -94:
         case -93:
         case -92:
         case -91:
         case -90:
         case -89:
         case -88:
         case -87:
         case -86:
         case -85:
         case -84:
         case -83:
         case -82:
         case -81:
         case -80:
         case -79:
         case -78:
         case -77:
         case -76:
         case -75:
         case -74:
         case -73:
         case -72:
         case -71:
         case -70:
         case -69:
         case -68:
         case -67:
         case -66:
         case -65:
         case -64:
         case -63:
         case -62:
         case -61:
         case -60:
         case -59:
         case -58:
         case -57:
         case -56:
         case -55:
         case -54:
         case -53:
         case -52:
         case -51:
         case -50:
         case -49:
         case -48:
         case -47:
         case -46:
         case -45:
         case -44:
         case -43:
         case -42:
         case -41:
         case -40:
         case -39:
         case -38:
         case -37:
         case -36:
         case -35:
         case -34:
         case -33:
         case -32:
         case -31:
         case -30:
         case -29:
         case -28:
         case -27:
         case -26:
         case -25:
         case -24:
         case -23:
         case -22:
         case -21:
         case -20:
         case -19:
         case -18:
         case -17:
         case -16:
         case -15:
         case -14:
         case -13:
         case -12:
         case -11:
         case -10:
         case -9:
         case -8:
         case -7:
         case 0:
         case 6:
         case 7:
         case 19:
         case 29:
         case 30:
         case 34:
         case 35:
         case 47:
         case 50:
         case 51:
         case 52:
         case 53:
         case 55:
         case 56:
         case 57:
         case 61:
         case 64:
         case 65:
         case 67:
         case 68:
         case 69:
         case 70:
         case 71:
         case 72:
         case 73:
         case 74:
         case 75:
         case 76:
         case 77:
         case 78:
         case 79:
         case 80:
         case 81:
         case 82:
         case 83:
         case 84:
         case 85:
         case 86:
         case 87:
         case 88:
         case 89:
         case 98:
         case 100:
         case 103:
         case 104:
         case 105:
         case 109:
         case 110:
         case 112:
         case 113:
         case 114:
         case 117:
         case 121:
         case 122:
         case 123:
         case 125:
         case 126:
         case 127:
         case 130:
         case 131:
         case 132:
         case 133:
         case 136:
         case 137:
         case 138:
         case 139:
         case 140:
         case 141:
         default:
            break;
         case -6:
            this.a.k = -3;
            var3.a((String)k.a[22], (Object)"Þifre Hatýrlatma");
            var3.a((String)"Gw", (Object)m.a(4, 2, a[23], (new StringBuffer()).append(this.a.A)));
            var5.a(var3, 4, false);
            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case -5:
            this.a.k = 3;
            var3.a((String)k.a[22], (Object)a[1]);
            var3.a((String)k.a[23], (Object)this.a.a.b);
            var5.b(var3, 5);
            var5.a(-1, -1, -1, -1);
            this.a(var5);
            break;
         case -4:
            this.a.k = -5;
            var3.a((String)k.a[22], (Object)"Kayýt (2/2)");
            var3.a((String)"Gd", (Object)m.a(4, 2, a[23], (new StringBuffer()).append(this.a.A)));
            var5.a(var3, 4, true);
            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case -3:
            this.a.k = -4;
            var3.a((String)k.a[22], (Object)"Kayýt (1/2)");
            var3.a((String)"Ga", (Object)m.a(2, 10, "Kullanýcý Adý", (StringBuffer)null));
            var3.a((String)"Gs", (Object)m.a(2, 8, "Þifre", (StringBuffer)null));
            var5.a(var3, 4, true);
            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case -2:
            this.a.k = -2;
            var3.a((String)k.a[22], (Object)a[0]);
            var3.a((String)"Ga", (Object)m.a(2, 10, "Kullanýcý Adý", new StringBuffer(this.a.c)));
            var3.a((String)"Gs", (Object)m.a(3, 8, "Þifre", new StringBuffer(this.a.d)));
            var3.a((String)"Gd", (Object)m.a(4, 2, a[23], new StringBuffer(this.a.e)));
            var5.a(var3, 4, true);
            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case -1:
            var3.a((String)null, (Object)p.a(a[0], -2));
            var3.a((String)null, (Object)p.a(a[1], -3));
            var3.a((String)null, (Object)p.a(a[2], -20, this.a.t));
            var3.a((String)null, (Object)p.a(a[9], 128));
            var3.a((String)null, (Object)p.a(a[84], -6));
            var3.a((String)null, (Object)p.a(a[3], 65));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 1:
            this.a.a = this.a.c;
            var5.a();
            this.a(var5);
            if (this.a.g != null) {
               (var5 = this.a()).b = 33;
               this.a.a.b = this.a.g;
               this.a(var5, var3);
            }
            break;
         case 2:
            this.a.a = a[19] + k.a[10] + this.a.b().a(k.a[179]).a(k.a[155]).a[1] + k.a[201];
            var5.a((String)k.a[19], 6);
            this.a(var5);
            break;
         case 3:
            this.a.a = a[23];
            var5.a((String)k.a[34], 2);
            this.a(var5);
            break;
         case 5:
            this.a.k = 2;
            if (this.a.a[0] == 0L) {
               var3.a((String)k.a[222], (Object)p.a(a[10], 6));
               this.a.d = this.a;
            } else if (this.a.a[0] != 0L) {
               var3.a((String)k.a[222], (Object)p.a(a[11], 35));
            }

            var3.a((String)k.a[222], (Object)p.a(a[12], 7));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 8:
            this.a.k = 2;
            var3.a((String)k.a[222], (Object)p.a(a[13], 40));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 9:
            this.a.k = 2;
            if (this.c == 116) {
               var3.a((String)k.a[222], (Object)p.a(k.a[224], 22));
            } else {
               var3.a((String)k.a[222], (Object)p.a(k.a[224], 13));
            }

            var3.a((String)k.a[222], (Object)p.a(a[14], 44));
            var3.a((String)k.a[222], (Object)p.a(a[12], 7));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 10:
            this.a.k = 2;
            var3.a((String)k.a[222], (Object)p.a(a[15], 32));
            var3.a((String)k.a[222], (Object)p.a(a[16], 60));
            if (this.a.s == 0) {
               var3.a((String)k.a[222], (Object)p.a(a[17], 17));
               var3.a((String)k.a[222], (Object)p.a(a[18], 107));
            }

            var3.a((String)k.a[222], (Object)p.a(a[63], 101));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 11:
            this.a.k = 2;
            var3.a((String)k.a[222], (Object)p.a(a[79], 127));
            if (this.a.s == 0) {
               var3.a((String)k.a[222], (Object)p.a(a[19], 2));
               var3.a((String)k.a[222], (Object)p.a(a[20], 23));
               var3.a((String)k.a[222], (Object)p.a(a[21], 24));
               var3.a((String)k.a[222], (Object)p.a(a[22], 25));
               var3.a((String)k.a[222], (Object)p.a(a[23], 3));
            }

            var3.a((String)k.a[222], (Object)p.a(a[24], 10));
            var3.a((String)k.a[222], (Object)p.a(a[25], 63));
            var3.a((String)k.a[222], (Object)p.a(a[3], 21));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 12:
            this.a.k = 2;
            var3.a((String)k.a[222], (Object)p.a(k.a[145], 37));
            var3.a((String)k.a[222], (Object)p.a(k.a[30], 38));
            var3.a((String)k.a[222], (Object)p.a(k.a[120], 36));
            var3.a((String)k.a[222], (Object)p.a(k.a[40], 39));
            var3.a((String)k.a[222], (Object)p.a(a[26], 14));
            if (this.a.q > 1) {
               var3.a((String)k.a[222], (Object)p.a(a[27], 51));
            }

            if (Integer.parseInt(this.a.b.a(k.a[20])) == 0) {
               var3.a((String)k.a[222], (Object)p.a(a[90], 144));
            } else {
               var3.a((String)k.a[222], (Object)p.a(a[91], 145));
            }

            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 13:
            this.a();
            this.a.k = 6;
            String var6 = k.a(this.a.y);
            if (this.b) {
               if (this.a.y > 2 && this.a.y < 6) {
                  var3.a((String)k.a[22], (Object)var6);
                  var3.a((String)k.a[53], (Object)m.a(1, 7, k.a[16], (StringBuffer)null));
                  var3.a((String)k.a[53], (Object)m.a(1, 7, k.a[183], (StringBuffer)null));
                  var3.a((String)"L", (Object)m.a("Kapasite", this.a.d.a(k.a[104])));
                  a.setLength(0);
                  k.a(Integer.parseInt(this.a.d.a(k.a[144])), a);
                  var3.a((String)"L", (Object)m.a("Süre", a.toString()));
                  var5.a(var3, 5, false);
                  var5.a(-3, -3, -3, -3);
                  this.a.d.a();
               } else if (this.a.y == 14) {
                  this.a();
                  this.a();
                  this.a.b().a(this.a.b().a(k.a[19]));
                  this.a.b().a(this.a.b().a(k.a[103]));
                  this.a.f.a(this.a.f.a(k.a[19]));
                  this.a.f.a(this.a.f.a(k.a[103]));
               } else if (this.a.y != 11 && this.a.y != 12) {
                  a.setLength(0);
                  var3.a((String)k.a[23], (Object)a.append(k.a[191]).append(this.a.f.a(k.a[123])).toString());
                  a.setLength(0);
                  a.append(k.a[182]);
                  var3.a((String)k.a[25], (Object)k.a(Integer.parseInt(this.a.d.a(k.a[144])), a).toString());
                  var3.a((String)k.a[22], (Object)var6);
                  a.setLength(0);
                  var3.a((String)k.a[24], (Object)a.append(k.a[193]).append(this.a.f.a(k.a[135])).toString());
                  var5.b(var3, 2);
                  var5.a(-3, -3, -3, -3);
               } else {
                  a.setLength(0);
                  a.append(k.a[182]);
                  var3.a((String)k.a[23], (Object)k.a(Integer.parseInt(this.a.d.a(k.a[144])), a).toString());
                  var3.a((String)k.a[22], (Object)var6);
                  var5.b(var3, 8);
                  var5.a(-3, -3, -3, -3);
               }

               if (this.a.y != 14) {
                  this.a(var5);
               } else {
                  var5.c();
               }
            }
            break;
         case 14:
            this.a.k = 6;
            var3.a((String)k.a[22], (Object)("Mesaj Yaz: " + this.a.b.a(k.a[123])));
            var3.a((String)k.a[53], (Object)m.a(2, 294, k.a[222], (StringBuffer)null));
            var5.c(var3, 2);
            this.a(var5);
            break;
         case 15:
            this.a.k = 9;
            var3.a((String)k.a[22], (Object)a[18]);
            var3.a((String)k.a[53], (Object)m.a(2, 10, "Oyuncu", (StringBuffer)null));
            var3.a((String)k.a[53], (Object)m.a(1, 2, k.a[106], (StringBuffer)null));
            var3.a((String)k.a[53], (Object)m.a(1, 3, k.a[41], (StringBuffer)null));
            var3.a((String)k.a[53], (Object)m.a(1, 2, "Üs", (StringBuffer)null));
            var5.a(var3, 3, true);
            this.a(var5);
            break;
         case 16:
            this.a.k = 2;
            var3.a((String)k.a[22], (Object)a[28]);
            var3.a((String)"Gi", (Object)m.a(2, 10, "Ittifak Adý", (StringBuffer)null));
            var5.a(var3, 4, false);
            var5.a(-1, 55, -1, -1);
            this.a(var5);
            break;
         case 17:
            this.a.k = 2;
            if (this.a.q == 0) {
               var3.a((String)k.a[222], (Object)p.a(a[28], 16));
            } else {
               var3.a((String)k.a[222], (Object)p.a(a[29], 59));
               var3.a((String)k.a[222], (Object)p.a(a[30], 20));
               var3.a((String)k.a[222], (Object)p.a(a[31], 58));
               var3.a((String)k.a[222], (Object)p.a(a[69], 110));
               if (this.a.q == 3) {
                  var3.a((String)k.a[222], (Object)p.a(a[32], 53));
                  var3.a((String)k.a[222], (Object)p.a(a[78], 124));
                  var3.a((String)k.a[222], (Object)p.a(a[83], 135));
               }
            }

            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 18:
            this.a.k = 3;
            int var7 = 0;

            try {
               if (this.a.a.getClass() == Class.forName("i")) {
                  var3.a((String)k.a[22], (Object)((i)this.a.a).b());
                  var7 = Integer.parseInt(this.a.b.a(k.a[162]));
               } else {
                  var3.a((String)k.a[22], (Object)a[51]);
               }
            } catch (Exception var25) {
            }

            var3.a((Object)this.a.d, (String)k.a[47]);
            if ((var7 == 6 || var7 == 7) && ((i)this.a.a).a.compareTo(k.a[109]) == 0) {
               var5.b(var3, 6);
            } else {
               var5.b(var3, 4);
            }

            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case 20:
            this.a.a = "Ittifak Üyeleri";
            var5.a((String)k.a[176], 7);
            this.a(var5);
            break;
         case 21:
            this.a.k = 4;
            var3.a((String)k.a[22], (Object)a[3]);
            var3.a((String)k.a[23], (Object)"Oyundan çýkmak istediðinize emin misiniz!");
            var5.b(var3, 5);
            var5.a(-1, -1, -1, -1);
            this.a(var5);
            break;
         case 22:
            this.a.k = 2;

            for(int var27 = 0; var27 < this.a.c(); ++var27) {
               h var8 = this.a.a.a(var27).a(0);
               var3.a((String)k.a[222], (Object)p.a(var8.a(k.a[135]) + k.a[9] + var8.a(k.a[189]) + ')', 22));
            }

            var5.a(var3, this.a.j);
            this.a(var5);
            break;
         case 23:
            this.a.a = a[20];
            var5.a((String)k.a[179], 1);
            this.a(var5);
            break;
         case 24:
            this.a.a = a[21];
            var5.a((String)k.a[143], 6);
            this.a(var5);
            break;
         case 25:
            this.a.a = a[22] + k.a[10] + this.a.b().a(k.a[179]).a(k.a[226]).a[1] + k.a[201];
            var5.a((String)k.a[161], 1);
            this.a(var5);
            break;
         case 26:
            this.a.k = 2;
            boolean var9 = true;
            String var28;
            if (((i)this.a.a).a.compareTo(k.a[161]) == 0 && (var28 = this.a.b.a(k.a[187])) != null && var28.length() > 0 && this.a.a().compareTo(var28) != 0) {
               var9 = false;
            }

            if (var9) {
               if (((i)this.a.a).a.compareTo(k.a[143]) == 0) {
                  if (!((i)this.a.a).a(23) && !((i)this.a.a).a(28)) {
                     var3.a((String)k.a[222], (Object)p.a(a[33], 34));
                  }
               } else if (!((i)this.a.a).b()) {
                  var3.a((String)k.a[222], (Object)p.a(a[33], 34));
               }

               if (this.a.a[0] != 0L) {
                  var3.a((String)k.a[222], (Object)p.a(a[34], 35));
               }
            }

            var3.a((String)k.a[222], (Object)p.a(a[12], 7));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 27:
            this.a.k = 2;
            var3.a((String)k.a[222], (Object)p.a(a[35], 19));
            if ((Integer)this.a.b.a(k.a[26]) == 1) {
               var3.a((String)k.a[222], (Object)p.a(a[36], 47));
            }

            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 28:
            this.a.k = 2;
            int var10 = (int)this.a.a[0];
            int var29 = this.a.a(k.a[123]) == null ? 0 : Integer.parseInt(this.a.a(k.a[123]));
            if (!((i)this.a.a).b() && var29 == 0) {
               var3.a((String)k.a[222], (Object)p.a(a[33], 34));
            }

            if (var10 != 0) {
               var3.a((String)k.a[222], (Object)p.a(a[34], 35));
            }

            if (var10 == 0 && var29 == 0) {
               var3.a((String)k.a[222], (Object)p.a(a[37], 45));
               var3.a((String)k.a[222], (Object)p.a(a[38], 42));
               var3.a((String)k.a[222], (Object)p.a(a[39], 43));
            }

            if (var29 == 11 || var29 == 12) {
               var3.a((String)k.a[222], (Object)p.a(a[35], 46));
               var3.a((String)k.a[222], (Object)p.a(a[36], 67));
            }

            var3.a((String)k.a[222], (Object)p.a(a[12], 7));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 31:
            this.a.a = a[23];
            var5.a((String)k.a[34], 2);
            this.a(var5);
            break;
         case 32:
            if (this.a.o == 0) {
               this.a.a = a[73];
            } else if (this.a.o == 1) {
               this.a.a = a[74];
            } else if (this.a.o == 2) {
               this.a.a = a[15];
            }

            var5.b();
            this.a(var5);
            break;
         case 33:
            this.a.k = 3;
            var3.a((String)k.a[22], (Object)a[49]);
            var3.a((String)k.a[23], (Object)this.a.a.b);
            var5.b(var3, 5);
            var5.a(-1, -1, -1, -1);
            this.a(var5);
            break;
         case 41:
            this.a.a = a[67];
            var5.a((String)k.a[13], 5);
            this.a(var5);
            if (this.a.g > 0) {
               (var5 = this.a()).b = var1;
               this.a.a.b = "Ilk 10 kayýt gösteriliyor !";
               this.a(var5, var3);
            }
            break;
         case 42:
            this.a.k = 5;
            this.a.f = null;
            this.a.a = k.a[113];
            this.a.y = 11;
            this.a.a(k.a[179]);
            this.a.a(k.a[19]);
            var5.a(this.a.b().a(k.a[19]), this.a.b().a(k.a[103]), k.a[129]);
            this.a(var5);
            break;
         case 43:
            this.a.k = 5;
            this.a.f = null;
            this.a.a = k.a[112];
            this.a.y = 12;
            this.a.a(k.a[179]);
            this.a.a(k.a[19]);
            var5.a(this.a.b().a(k.a[19]), this.a.b().a(k.a[103]), k.a[130]);
            this.a(var5);
            break;
         case 44:
            this.a();
            if (this.a.b == 32) {
               ((i)this.a.a).g(3);
            } else if ((Integer)this.a.d.a(k.a[50]) == 43) {
               ((i)this.a.a).g(2);
            } else {
               ((i)this.a.a).g(1);
            }
            break;
         case 45:
            this.a.k = 3;
            new h(2);
            h var30 = null;
            this.a.b().a(k.a[19]);
            var3.a((String)k.a[22], (Object)a[37]);
            h var32 = this.a.b().a(k.a[19]);
            h var33 = this.a.b().a(k.a[103]);
            h var34 = new h(10);
            int var35 = 0;

            for(int var37 = 1; var37 < var32.a; ++var37) {
               var35 += Integer.parseInt(var32.a(var37).a(k.a[54]));
               if (Integer.parseInt(var32.a(var37).a(k.a[54])) > 0) {
                  var34.a((String)null, (Object)(k.b(Integer.parseInt(var32.a(var37).a(k.a[162]))) + ": " + var32.a(var37).a(k.a[54])));
               }
            }

            if (var33 != null) {
               for(int var38 = 1; var38 < var33.a; ++var38) {
                  if (Integer.parseInt(var33.a(var38).a(k.a[170])) == 3) {
                     var34.a((String)null, (Object)var33.a(var38).a(k.a[91]));
                     ++var35;
                  }
               }
            }

            (var30 = new h(2)).a((String)null, (Object)("Savaþçýlar: " + var35));
            var30.a((String)null, (Object)var34);
            var3.a((String)k.a[47], (Object)var30);
            var5.b(var3, 4);
            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case 46:
            this.a.k = 3;
            h var16 = new h(10);
            this.a.b().a(k.a[19]);
            (var3 = new h(5)).a((String)k.a[22], (Object)"Maðara Görev");
            h var14 = this.a.b().a(k.a[19]);
            h var15 = this.a.b().a(k.a[103]);
            int var17 = 0;

            for(int var18 = 1; var18 < var14.a; ++var18) {
               var17 += Integer.parseInt(var14.a(var18).a(k.a[177]));
               if (Integer.parseInt(var14.a(var18).a(k.a[177])) > 0) {
                  var16.a((String)null, (Object)(k.b(Integer.parseInt(var14.a(var18).a(k.a[162]))) + ": " + var14.a(var18).a(k.a[177])));
               }
            }

            if (var15 != null) {
               for(int var39 = 1; var39 < var15.a; ++var39) {
                  int var36;
                  if ((var36 = Integer.parseInt(var15.a(var39).a(k.a[170]))) == 4 || var36 == 5) {
                     var16.a((String)null, (Object)var15.a(var39).a(k.a[91]));
                     ++var17;
                  }
               }
            }

            h var12;
            (var12 = new h(2)).a((String)null, (Object)("Görevli Savaþçýlar: " + var17));
            var12.a((String)null, (Object)var16);
            var3.a((String)k.a[47], (Object)var12);
            var5.b(var3, 4);
            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case 48:
         case 49:
            this.a.k = 2;
            int var19;
            if ((var19 = Integer.parseInt(this.a.b.a(k.a[162]))) == 8) {
               var3.a((String)k.a[222], (Object)p.a(a[40], 18));
               var3.a((String)k.a[222], (Object)p.a(a[43], 52));
               var3.a((String)k.a[222], (Object)p.a(a[44], 126));
            } else if (var19 == 9) {
               var3.a((String)k.a[222], (Object)p.a(a[40], 18));
               var3.a((String)k.a[222], (Object)p.a(a[43], 125));
               var3.a((String)k.a[222], (Object)p.a(a[44], 126));
            } else {
               var3.a((String)k.a[222], (Object)p.a(a[40], 18));
               if (var1 == 48) {
                  var3.a((String)k.a[222], (Object)p.a(a[41], 14));
                  var3.a((String)k.a[222], (Object)p.a(a[90], 143));
               }

               var3.a((String)k.a[222], (Object)p.a(a[42], 50));
            }

            if (var19 == 6 || var19 == 7) {
               var3.a((String)k.a[222], (Object)p.a(a[87], 139));
            }

            var3.a((String)k.a[222], (Object)p.a(a[14], 44));
            if (this.a.o == 0) {
               var3.a((String)k.a[222], (Object)p.a(a[70], 112));
               var3.a((String)k.a[222], (Object)p.a(a[71], 113));
            } else if (this.a.o == 1) {
               var3.a((String)k.a[222], (Object)p.a(a[70], 112));
               var3.a((String)k.a[222], (Object)p.a(a[72], 114));
            } else {
               var3.a((String)k.a[222], (Object)p.a(a[71], 113));
               var3.a((String)k.a[222], (Object)p.a(a[72], 114));
            }

            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 54:
            this.a.k = 2;
            if (this.a.q == 3) {
               var3.a((String)k.a[222], (Object)p.a(a[45], 55));
               var3.a((String)k.a[222], (Object)p.a(a[46], 57));
               var3.a((String)k.a[222], (Object)p.a(a[47], 56));
               var3.a((String)k.a[222], (Object)p.a(a[80], 130));
            }

            var3.a((String)k.a[222], (Object)p.a(a[26], 14));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 58:
            this.a.k = 6;
            var3.a((String)k.a[22], (Object)a[31]);
            var3.a((String)k.a[53], (Object)m.a(2, 294, k.a[222], (StringBuffer)null));
            var5.c(var3, 2);
            this.a(var5);
            break;
         case 59:
            this.a.k = 3;
            var3.a((String)k.a[22], (Object)a[29]);
            var3.a((Object)this.a.d, (String)k.a[47]);
            var5.b(var3, 4);
            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case 60:
            this.a.k = 3;
            var3.a((String)k.a[22], (Object)a[16]);
            var3.a((Object)this.a.d, (String)k.a[47]);
            var5.b(var3, 4);
            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case 62:
            this.a.k = 8;
            var3.a((String)k.a[22], (Object)a[5]);
            var3.a((String)"Gi", (Object)m.a(2, 10, "Þehir Adý", (StringBuffer)null));
            var5.a(var3, 4, false);
            var5.a(-1, 55, -1, -1);
            this.a(var5);
            break;
         case 63:
            this.a.k = 2;
            var3.a((String)k.a[222], (Object)p.a(a[89], 142));
            if (this.a.s == 0) {
               var3.a((String)k.a[222], (Object)p.a(a[4], 61));
               var3.a((String)k.a[222], (Object)p.a(a[5], 62));
            } else {
               var3.a((String)k.a[222], (Object)p.a(a[7], 64));
            }

            var3.a((String)k.a[222], (Object)p.a(a[8], 134));
            var3.a((String)k.a[222], (Object)p.a(a[9], 128));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 66:
            this.a.k = 3;
            var3.a((String)k.a[22], (Object)a[48]);
            var3.a((Object)this.a.d, (String)k.a[47]);
            var5.b(var3, 4);
            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case 90:
            this.a.k = 4;
            var3.a((String)k.a[22], (Object)a[49]);
            var3.a((String)k.a[23], (Object)this.a);
            var5.b(var3, 5);
            var5.a(-1, -1, -1, -1);
            this.a(var5);
            break;
         case 91:
            this.a.k = 8;
            var3.a((String)k.a[22], (Object)a[53]);
            var3.a((String)"Ge", (Object)m.a(2, 8, "Eski Þifre", (StringBuffer)null));
            var3.a((String)"Gy", (Object)m.a(2, 8, "Yeni Þifre", (StringBuffer)null));
            var3.a((String)"Gt", (Object)m.a(2, 8, "Yeni Þifre Tekrar", (StringBuffer)null));
            var5.a(var3, 4, true);
            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case 92:
            this.a.k = 2;
            int var20 = (int)this.a.a[0];
            if (!((i)this.a.a).b()) {
               var3.a((String)k.a[222], (Object)p.a(a[33], 34));
            }

            if (var20 != 0) {
               var3.a((String)k.a[222], (Object)p.a(a[34], 35));
            }

            var3.a((String)k.a[222], (Object)p.a(a[54], 93));
            var3.a((String)k.a[222], (Object)p.a(a[12], 7));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 93:
            this.a.a = a[54];
            var5.a((String)k.a[103], 8);
            this.a(var5);
            break;
         case 94:
            this.a.k = 2;
            int var21 = Integer.parseInt(this.a.b.a(k.a[170]));
            if (!((i)this.a.a).b() && var21 == 6) {
               var3.a((String)k.a[222], (Object)p.a(a[55], 99));
            }

            if (var21 == 7) {
               var3.a((String)k.a[222], (Object)p.a(a[56], 100));
            }

            var3.a((String)k.a[222], (Object)p.a(a[60], 96));
            var3.a((String)k.a[222], (Object)p.a(a[57], 95));
            var3.a((String)k.a[222], (Object)p.a(a[12], 7));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 95:
            this.a.k = 8;
            var3.a((String)k.a[22], (Object)a[59]);
            var3.a((String)"Gi", (Object)m.a(2, 10, "Kahraman Adý", (StringBuffer)null));
            var5.a(var3, 4, false);
            var5.a(-1, 55, -1, -1);
            this.a(var5);
            break;
         case 96:
            this.a.a = a[60];
            if (this.a.b.a(k.a[178]) != null) {
               this.a.e = this.a.b;
            }

            var5.a((String)k.a[243], 9);
            this.a(var5);
            break;
         case 97:
            this.a.k = 2;
            if (Integer.parseInt(this.a.e.a(k.a[178])) > 0) {
               var3.a((String)k.a[222], (Object)p.a(a[58], 98));
            }

            var3.a((String)k.a[222], (Object)p.a(a[12], 7));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 99:
            this.a.k = 4;
            this.a.e = this.a.b;
            a.setLength(0);
            var3.a((String)k.a[23], (Object)a.append("Kahraman: ").append(this.a.b.a(k.a[91])).toString());
            a.setLength(0);
            a.append("Süre: ");
            var3.a((String)k.a[24], (Object)k.a(Integer.parseInt(this.a.b.a(k.a[144])), a).toString());
            var3.a((String)k.a[22], (Object)a[62]);
            var5.b(var3, 7);
            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case 101:
            this.a.k = 2;
            var3.a((String)k.a[222], (Object)p.a(a[64], 103));
            var3.a((String)k.a[222], (Object)p.a(a[65], 104));
            var3.a((String)k.a[222], (Object)p.a(a[66], 105));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 102:
            if (this.a.f == 1) {
               this.a.a = a[64];
            } else if (this.a.f == 2) {
               this.a.a = a[66];
            } else if (this.a.f == 3) {
               this.a.a = a[65];
            }

            var5.a((String)k.a[249], 10);
            this.a(var5);
            break;
         case 106:
            this.a.k = 2;
            var3.a((String)k.a[222], (Object)p.a(a[26], 14));
            var3.a((String)k.a[222], (Object)p.a(a[88], 141));
            if (this.a.q > 1) {
               var3.a((String)k.a[222], (Object)p.a(a[27], 51));
            }

            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 107:
            this.a.k = 2;
            var3.a((String)k.a[222], (Object)p.a(a[67], 15));
            var3.a((String)k.a[222], (Object)p.a(a[68], 108));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 108:
            this.a.k = 9;
            var3.a((String)k.a[22], (Object)a[68]);
            var3.a((String)"Gi", (Object)m.a(2, 10, "Ittifak Adý", (StringBuffer)null));
            var5.a(var3, 4, false);
            var5.a(-1, 55, -1, -1);
            this.a(var5);
            break;
         case 111:
            this.a.a = a[68];
            var5.a((String)k.a[13], 11);
            this.a(var5);
            if (this.a.g > 0) {
               (var5 = this.a()).b = var1;
               this.a.a.b = "Ilk 10 kayýt gösteriliyor !";
               this.a(var5, var3);
            }
            break;
         case 115:
            this.a.k = 2;
            int var11 = this.a.b.a(k.a[123]) == null ? 0 : Integer.parseInt(this.a.b.a(k.a[123]));
            if (!((i)this.a.a).b() && var11 == 0) {
               var3.a((String)k.a[222], (Object)p.a(a[33], 34));
            }

            if (this.a.a[0] != 0L) {
               var3.a((String)k.a[222], (Object)p.a(a[34], 35));
            }

            if (var11 == 0) {
               var3.a((String)k.a[222], (Object)p.a(a[75], 116));
            }

            var3.a((String)k.a[222], (Object)p.a(a[12], 7));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 116:
            var2 = k.a[263];
         case 36:
            if (var1 == 36) {
               var2 = k.a[132];
            }
         case 37:
            if (var1 == 37) {
               var2 = k.a[128];
            }
         case 38:
            if (var1 == 38) {
               var2 = k.a[131];
            }
         case 39:
            if (var1 == 39) {
               var2 = k.a[133];
            }
         case 40:
            if (var1 == 40) {
               var2 = k.a[134];
            }
         case 4:
            this.a.k = 5;
            this.a.a = a[52];
            this.a.y = Integer.parseInt(var2.substring(1));
            this.a.a(k.a[179]);
            this.a.a(k.a[19]);
            if (var1 == 4) {
               var2 = k.a[200];
            }

            var5.a(this.a.b().a(k.a[19]), this.a.b().a(k.a[103]), var2);
            this.a(var5);
            break;
         case 118:
            this.a.k = 3;
            var3.a((String)k.a[22], (Object)a[76]);
            var3.a((Object)this.a.d, (String)k.a[47]);
            var5.b(var3, 4);
            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case 119:
            this.a.k = 2;
            var3.a((String)k.a[222], (Object)p.a(a[76], 118));
            var3.a((String)k.a[222], (Object)p.a(a[77], 121));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 120:
            this.a.k = 2;
            var3.a((String)k.a[222], (Object)p.a(a[76], 123));
            var3.a((String)k.a[222], (Object)p.a(a[77], 122));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 124:
            this.a.k = 8;
            var3.a((String)k.a[22], (Object)a[78]);
            StringBuffer var23 = null;
            String var24;
            if ((var24 = this.a.d.a(0)) != null) {
               k.a(var23 = new StringBuffer(var24), '|', ' ');
            }

            var3.a((String)k.a[53], (Object)m.a(2, 500, k.a[222], var23));
            var5.c(var3, 2);
            this.a(var5);
            break;
         case 128:
            this.a.k = -3;
            var3.a((String)k.a[22], (Object)a[9]);
            var3.a((Object)this.a.d, (String)k.a[47]);
            var5.b(var3, 4);
            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case 129:
            this.a.k = 3;
            var3.a((String)k.a[22], (Object)a[8]);
            var3.a((Object)this.a.d, (String)k.a[47]);
            var5.b(var3, 4);
            var5.a(-2, -2, -2, -2);
            this.a(var5);
            break;
         case 134:
            var3.a((String)k.a[222], (Object)p.a(a[53], 91));
            if (this.a.s == 0) {
               var3.a((String)k.a[222], (Object)p.a(a[6], 64));
            } else {
               var3.a((String)k.a[222], (Object)p.a(a[7], 64));
            }

            var3.a((String)k.a[222], (Object)p.a(a[85], 136));
            var3.a((String)k.a[222], (Object)p.a(a[81], 137));
            var3.a((String)k.a[222], (Object)p.a(a[82], 129));
            var5.a((h)var3, 0);
            this.a(var5);
            break;
         case 135:
            this.a.k = 9;
            var3.a((String)k.a[22], (Object)a[83]);
            var3.a((String)"Gi", (Object)m.a(2, 10, "Yeni Ittifak Adý", (StringBuffer)null));
            var5.a(var3, 4, false);
            var5.a(-1, 55, -1, -1);
            this.a(var5);
            break;
         case 142:
            this.a.k = 6;
            var3.a((String)k.a[22], (Object)a[89]);
            var3.a((String)"Gi", (Object)m.a(1, 11, "Arkadaþýnýn Cep Nosu", (StringBuffer)null));
            var5.a(var3, 4, false);
            var5.a(-1, 55, -1, -1);
            this.a(var5);
      }

      return var5;
   }

   private void a(h var1) {
      for(int var3 = 1; var3 < var1.a; ++var3) {
         if (var1.a(var3).getClass() == var1.getClass() && var1.b(var3).startsWith(k.a[53])) {
            h var2 = var1.a(var3);
            if (var3 != 1) {
               a.append('&');
            }

            if ((Integer)var2.a(k.a[164]) == 3) {
               a.append(var1.b(var3).substring(1)).append(k.a[5]).append(var2.a(k.a[227]));
            } else {
               a.append(var1.b(var3).substring(1)).append(k.a[5]).append(var2.a(k.a[36]));
            }
         }
      }

   }

   private boolean a(StringBuffer var1, int var2) {
      if (this.a.a.a != null) {
         this.a.a.b = "Þu anda baðlantý kurulamýyor, lütfen daha sonra tekrar deneyiniz!";
         return false;
      } else {
         this.a = null;
         int var3 = 0;
         this.a.a.a = (byte)var2;
         this.a.a.b = 0;

         try {
            try {
               synchronized(this.a.a) {
                  this.a.a.a(var1);
                  this.a.a.notify();
               }

               this.a = 1;

               while(var3 < 30000) {
                  if (this.a.a.b > 0) {
                     if (this.a.a.b != 2) {
                        if (this.a.a.b == 3) {
                           this.a.a.b = "Iletiþim isteði engellendi!";
                           boolean var19 = false;
                           return false;
                        }

                        if (this.a.a.b == 5) {
                           this.a.a.b = "Sistemde oluþan bir hata nedeniyle iþleminiz gerçekleþtirilemiyor, lütfen daha sonra tekrar deneyiniz!";
                           boolean var18 = false;
                           return false;
                        }

                        if (this.a.a.a != 1) {
                           boolean var17 = false;
                           return false;
                        }

                        boolean var16 = true;
                        return var16;
                     }

                     this.a.a.b = "Þu anda baðlantý kurulamýyor, lütfen daha sonra tekrar deneyiniz!";
                     boolean var4 = false;
                     return var4;
                  }

                  try {
                     this.a.a.repaint();
                     this.a.a.serviceRepaints();
                     ++this.a;
                     Thread.sleep(500L);
                     var3 += 500;
                  } catch (Exception var13) {
                     this.a.a.b = 2;
                     this.a.a.b = "Hata: MW-021";
                     break;
                  }
               }

               this.a.a.b = "Iletiþim zaman aþýmý hatasý!";
            } catch (Exception var14) {
               this.a.a.b = 2;
               this.a.a.b = "Hata: MW-022";
            }

            return false;
         } finally {
            this.a = 0;
            if (this.a.a.a == 1 && this.a.a.b == 1 && var3 < 30000) {
               this.b = true;
            } else {
               this.a(33);
               this.b = false;
               this.d = 0;
            }

         }
      }
   }

   private boolean a(int var1, String var2) {
      try {
         ByteArrayOutputStream var3 = new ByteArrayOutputStream();
         DataOutputStream var4;
         (var4 = new DataOutputStream(var3)).writeUTF(var2);
         byte[] var5 = var3.toByteArray();
         this.a.setRecord(var1, var5, 0, var5.length);
         var4.close();
         var3.close();
         return true;
      } catch (Exception var6) {
         return false;
      }
   }

   private void c() throws Exception {
      for(int var1 = 1; var1 <= this.a.getNumRecords(); ++var1) {
         ByteArrayInputStream var2 = new ByteArrayInputStream(this.a.getRecord(var1));
         DataInputStream var3;
         String var4 = (var3 = new DataInputStream(var2)).readUTF();
         if (var1 == 1) {
            this.a.t = Integer.parseInt(var4);
         } else if (var1 == 2) {
            this.a.c = var4;
         } else if (var1 == 3) {
            this.a.d = var4;
         } else if (var1 == 4) {
            this.a.e = var4;
            if (var4 == null || var4.length() == 0) {
               this.a.e = k.a[188];
            }
         }

         var2.close();
         var3.close();
      }

   }

   private boolean a() {
      try {
         this.a = RecordStore.openRecordStore(k.a[148], false);
         this.c();
         return true;
      } catch (RecordStoreNotFoundException var27) {
         try {
            this.a = RecordStore.openRecordStore(k.a[148], true);
            String[] var30 = new String[]{k.a[188], k.a[222], k.a[222], k.a[222], k.a[188]};

            try {
               for(int var32 = 0; var32 < var30.length; ++var32) {
                  ByteArrayOutputStream var33 = new ByteArrayOutputStream();
                  DataOutputStream var5;
                  (var5 = new DataOutputStream(var33)).writeUTF(var30[var32]);
                  var5.flush();
                  byte[] var6 = var33.toByteArray();
                  this.a.addRecord(var6, 0, var6.length);
                  var33.close();
                  var5.close();
               }

               this.c();
               return true;
            } catch (Exception var24) {
               this.a.a.b = "Kayýtçý ilkleme hatasý!";
               boolean var4 = false;
            }
         } catch (RecordStoreFullException var25) {
            this.a.a.b = "Telefon hafýzasý dolu, lütfen yer açýnýz!";
            boolean var31 = false;
            return false;
         } catch (Exception var26) {
            this.a.a.b = "Kayýtçý hatasý!";
            boolean var3 = false;
            return false;
         }
      } catch (Exception var28) {
         this.a.a.b = "Kayýt ilkleme hatasý!";
         boolean var2 = false;
         return false;
      } finally {
         try {
            this.a.closeRecordStore();
            this.a = null;
         } catch (Exception var23) {
            return false;
         }
      }

      return false;
   }

   private boolean a(int var1) {
      try {
         if (var1 == -1) {
            RecordStore.deleteRecordStore("Kyn");
         }

         this.b = RecordStore.openRecordStore("Kyn", false);
         if (this.b.getRecordSize(1) != this.a.r) {
            this.b.closeRecordStore();
            RecordStore.deleteRecordStore("Kyn");
            throw new RecordStoreNotFoundException();
         }

         if (this.a.a(this.b)) {
            return true;
         }

         return false;
      } catch (RecordStoreNotFoundException var51) {
         try {
            InputStream var3 = null;
            OutputStream var4 = null;
            SocketConnection var5 = null;
            Object var6 = null;

            try {
               int var8;
               try {
                  var4 = (var5 = (SocketConnection)Connector.open(this.a.i)).openOutputStream();
                  var3 = var5.openInputStream();
                  ByteArrayOutputStream var54 = new ByteArrayOutputStream();
                  String var9 = this.a.e + k.a[82];
                  var4.write(var9.getBytes());
                  var4.write(10);
                  var4.flush();

                  while((var8 = var3.read()) != -1) {
                     var54.write(var8);
                  }

                  byte[] var7 = var54.toByteArray();
                  var54.close();
                  this.b = RecordStore.openRecordStore("Kyn", true);
                  this.b.addRecord(var7, 0, var7.length);
                  if (!this.a.a(this.b)) {
                     return false;
                  }
               } catch (Exception var48) {
                  var8 = 0;
                  return (boolean)var8;
               }
            } finally {
               try {
                  if (var3 != null) {
                     var3.close();
                  }

                  if (var4 != null) {
                     var4.close();
                  }

                  if (var5 != null) {
                     var5.close();
                  }
               } catch (Exception var47) {
               }

            }
         } catch (Exception var50) {
            return false;
         }
      } catch (Exception var52) {
         return false;
      } finally {
         try {
            this.b.closeRecordStore();
         } catch (Exception var46) {
         }

      }

      return true;
   }

   private void a(o var1, h var2) {
      this.a.k = 3;
      var2.a((String)k.a[22], (Object)a[49]);
      var2.a((String)k.a[23], (Object)this.a.a.b);
      var1.b(var2, 5);
      var1.a(-1, -1, -1, -1);
      this.a(var1);
   }

   public final int a() {
      return this.a[this.b - 1].b;
   }
}
