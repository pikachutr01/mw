import javax.microedition.lcdui.Graphics;

public final class l extends n {
   public int e = 1;
   private Graphics a;
   private h a;
   private int f = 0;
   private int g = 1;
   private int h;
   private int i;
   private int j;
   private static int k;
   private int l;
   public static r c;
   private h[] a = new h[10];
   private int[] a = new int[10];

   public l(k var1) {
      super(var1);
      k = n.a.a + 1;
   }

   public final void a(Graphics var1) {
      this.a = var1;
      if (this.e == 5) {
         n.a.a(this.a.a(k.a[23]));
         n.a.a(super.c - 8, super.c - 8, 2, 1);
         super.d = 14 * (n.a.d + 1) + 5;
         super.b = (n.a.c - super.d) / 2;
      }

      this.h = super.d / (n.a.a + 2);
      this.a.translate(super.a, super.b);
      n.a.b(this.a, 0, 0, super.c, super.d, 1);
      n.a.a(this.a, 0, 0, super.c, 17, 2);
      n.a.setLength(0);
      n.a.append(this.a.a(k.a[22]));
      k.a(n.a, '|', ' ');
      n.a.a(n.a);
      n.a.a(super.c, super.c, 0, 1);
      n.a.a(super.c / 2, 2, this.a);
      this.a.translate(0, 17);
      if (this.e == 2) {
         this.b();
      } else if (this.e == 3) {
         this.c();
      } else if (this.e == 4) {
         this.d();
      } else if (this.e == 5) {
         this.e();
      } else if (this.e == 6) {
         this.f();
      } else if (this.e == 7) {
         this.g();
      } else if (this.e == 8) {
         this.h();
      }

      if (this.e == 1 || this.e == 3 || this.e == 4 || this.e == 6) {
         this.a.translate(0 - this.a.getTranslateX() + super.a, 0 - this.a.getTranslateY() + super.b);
         this.a.setClip(0, 0, n.a.b, n.a.c);
         int var2 = 0;
         int var10000 = this.j - this.h + 1 > 0 ? this.j - this.h + 1 : 0;
         int var3 = var10000;
         if (var10000 > 0) {
            var2 = 17 + (int)a.a(a.c(a.b((long)(super.d - 24)), a.b((long)var3)) * (long)(this.g - 1));
         }

         if (var2 > super.d - 23) {
            var2 = super.d - 23;
         }

         if (var3 > 0) {
            this.a.drawRegion(n.a.a, 135, 95, 3, 16, 0, super.c - 3, var2, 20);
         }
      }

   }

   private void b() {
      n.a.a(this.a.a(k.a[23]));
      n.a.a(super.c - 4, super.c - 4, 2, 1);
      n.a.a(super.c / 2, 0, this.a);
      n.a.a(this.a.a(k.a[24]));
      n.a.a(super.c - 4, super.c - 4, 2, 1);
      n.a.a(super.c / 2, 15, this.a);
      if (this.a.a(k.a[25]) != null) {
         n.a.a(this.a.a(k.a[25]));
         n.a.a(super.c - 4, super.c - 4, 2, 1);
         n.a.a(super.c / 2, 30, this.a);
      }

      if (n.a.b > 150) {
         n.a.a(n.a.append(n.a.a()).append(" þehrinden ").append(n.a.f.a(k.a[135])).append(k.a[0]).append(n.a.f.a(k.a[123])).append(k.a[1]).append(" koordinatýna ordu göndereceksiniz. Emin misiniz!"));
         n.a.a(super.c - 10, super.c - 10, 2, 1);
         n.a.a(super.c / 2, 50, this.a);
      }

   }

   private void c() {
      int var1 = 0;
      this.l = 1;
      if (this.l >= this.g && this.g + this.h >= this.l) {
         n.a.a(n.a.append(this.a.a(k.a[23])).append(k.a[4]));
         n.a.a(4, (this.l - this.g) * k, this.a);
         var1 = n.a.c;
         n.a.a(this.a.a(k.a[37]));
         n.a.a(var1 + 6, (this.l - this.g) * k, this.a);
      }

      if (this.a.a(k.a[24]) != null) {
         ++this.l;
         if (this.l >= this.g && this.g + this.h >= this.l) {
            n.a.a(n.a.append(this.a.a(k.a[24])).append(k.a[4]));
            n.a.a(4, (this.l - this.g) * k, this.a);
            var1 = n.a.c;
            n.a.a(this.a.a(k.a[38]));
            n.a.a(var1 + 6, (this.l - this.g) * k, this.a);
         }
      }

      ++this.l;
      if (this.l >= this.g && this.g + this.h >= this.l) {
         n.a.a(n.a.append(this.a.a(k.a[25])).append(k.a[4]));
         n.a.a(4, (this.l - this.g) * k, this.a);
      }

      ++this.l;
      int var2 = 0;
      n.a.a(this.a.a(k.a[39]));
      n.a.a(super.c - 12, super.c - 12, 2, 4);
      this.j = this.l + n.a.d;
      if (this.l - this.g < 0) {
         var2 = n.a.d - (this.g - this.l) > this.h ? this.h : n.a.d - (this.g - this.l);
         n.a.a(6, 0, this.g - this.l, this.g - this.l + var2 - 1, 0, this.a);
      } else {
         var2 = this.h - (this.l - this.g) - 1;
         n.a.a(6, (this.l - this.g) * k, 0, var2, 0, this.a);
      }
   }

   private void d() {
      this.l = 1;
      this.j = this.l;
      this.a.translate(6, 0);
      this.a(this.a.a(k.a[47]), 5);
   }

   private void e() {
      n.a.a(this.a.a(k.a[23]));
      n.a.a(super.c - 8, super.c - 8, 2, 1);
      n.a.a(super.c / 2, 0, this.a);
   }

   private void f() {
      this.a.setClip(0, 0, super.c, super.d - 20);
      n.a.setLength(0);
      n.a.append(n.a.d.a(k.a[14]));
      k.a(n.a, '|', ' ');
      c.a(n.a);
      c.a(super.c - 12, super.c - 12, 2, 4);
      c.a(6, 3, this.i - 1, this.i + this.h - 1, this.i, this.a);
      this.j = c.d + 1;
      this.g = this.i;
   }

   private void g() {
      n.a.a(this.a.a(k.a[23]));
      n.a.a(super.c - 4, super.c - 4, 2, 1);
      n.a.a(super.c / 2, 0, this.a);
      n.a.a(this.a.a(k.a[24]));
      n.a.a(super.c - 4, super.c - 4, 2, 1);
      n.a.a(super.c / 2, 15, this.a);
      n.a.a(n.a.append(n.a.e.a(k.a[91])).append(' ').append(n.a.e.a(k.a[108])).append(' ').append(k.a[16]).append(' ').append(n.a.e.a(k.a[110])).append(' ').append(k.a[183]).append(" karþýlýðýnda diriltilecek. Emin misiniz!"));
      n.a.a(super.c - 10, super.c - 10, 2, 1);
      n.a.a(super.c / 2, 50, this.a);
   }

   private void h() {
      n.a.a(this.a.a(k.a[23]));
      n.a.a(super.c - 4, super.c - 4, 2, 1);
      n.a.a(super.c / 2, 6, this.a);
      if (n.a.y == 11) {
         n.a.a("Seçtiðiniz savaþçýlar maðaraya girecek. Emin misiniz!");
      } else {
         n.a.a("Seçtiðiniz savaþçýlar maðaradan çýkartýlacak. Emin misiniz!");
      }

      n.a.a(super.c - 10, super.c - 10, 2, 1);
      n.a.a(super.c / 2, 50, this.a);
   }

   private void a(h var1, int var2) {
      int var3 = 0;
      boolean var4 = false;
      this.a[0] = var1;
      this.a.setClip(0, 0, super.c, super.d - 20);

      while(true) {
         for(int var6 = this.a[var3]; var6 < this.a[var3].a; ++var6) {
            this.a[var3] = var6;
            Object var5;
            if ((var5 = this.a[var3].a(this.a[var3])) != null) {
               if (var5.getClass() == var1.getClass()) {
                  ++var3;
                  this.a[var3] = (h)var5;
                  this.a[var3] = -1;
                  break;
               }

               n.a.setLength(0);
               n.a.append((String)var5);
               k.a(n.a, '|', ' ');
               n.a.a(n.a);
               n.a.a(super.c - (var2 * var3 + 20), super.c - (var2 * var3 + 20), 1, 20);
               this.j += n.a.d;
               this.l += n.a.d;
               if (((String)var5).compareTo(k.a[222]) != 0 && this.l >= this.g && this.g + this.h > this.l - n.a.d) {
                  n.a.a(20, this.a, var2 * var3, (this.l - this.g - n.a.d) * k + 3, 20);
                  n.a.a(var2 * var3 + 8, (this.l - this.g - n.a.d) * k, this.a);
                  this.a.translate(0, 2);
               }
            }
         }

         if (this.a[var3] != -1) {
            this.a[var3] = null;
            this.a[var3] = 0;
            --var3;
         }

         if (var3 < 0) {
            this.a.setClip(0, 0, n.a.b, n.a.c);
            return;
         }

         int var10002 = this.a[var3]++;
      }
   }

   public final void d(int var1) {
      this.f = --this.f % 2;
   }

   public final void c(int var1) {
      this.f = ++this.f % 2;
   }

   public final void a(int var1) {
      if (this.g + this.h <= this.j + 1) {
         ++this.g;
      }

      if (this.i + this.h <= this.j + 1) {
         ++this.i;
      }

   }

   public final void b(int var1) {
      this.g = this.g - 1 < 1 ? 1 : this.g - 1;
      this.i = this.i - 1 < 1 ? 1 : this.i - 1;
   }

   public final h a(int var1) {
      return null;
   }

   public final void a(h var1) {
      this.a = var1;
      this.g = 1;
      this.i = 1;

      for(int var2 = 0; var2 < this.a.length; ++var2) {
         this.a[var2] = null;
         this.a[var2] = 0;
      }

   }

   static {
      c = n.a.a.a(k.a[14]);
   }
}
