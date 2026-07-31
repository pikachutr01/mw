import javax.microedition.lcdui.Graphics;

public final class q extends n {
   private int e;
   private int f;
   private int g;

   public q(k var1) {
      super(var1);
      n.a.e = 15;
      n.a.d = 16;
      this.f = 5;
      this.g = n.a.c - n.a.d;
   }

   public final void a(Graphics var1) {
      n.a.setLength(0);
      if (n.a.b != null && n.a.d() > 0) {
         if (n.a.a.a.a.b == 1) {
            var1.drawImage(n.a.c, 0, 16, 20);
         }

         n.a.a(var1, 0, 0, n.a.b - n.a.h, 16, 1);
         n.a.a(var1, n.a.b - n.a.h, 0, n.a.h, 16, 2);
      } else {
         var1.drawImage(n.a.c, 0, 0, 20);
      }

      n.a.a(var1, 0, n.a.c - 16, n.a.b, 16, 3);
      if (n.a.k > 0 && n.a.b != null) {
         n.a.a(n.a.a);
         n.a.a(n.a.b - n.a.h, n.a.b - n.a.h, 1, 1);
         n.a.a((n.a.b - n.a.h) / 2, 2, var1);
         n.a.a(n.a.a());
         n.a.a(n.a.h, n.a.h, 1, 1);
         n.a.a(n.a.b - n.a.h + n.a.h / 2, 2, var1);
      }

      if (n.a.k == 5) {
         n.a.a(n.a.append(k.a[111]).append(n.a.p));
         n.a.a(n.a.b / 2 - n.a.c / 2, this.g + 2, var1);
      }

      if (n.a.k == 1) {
         if (n.a.a.a(0) != null) {
            h var4 = n.a.b().a(0);
            n.a.l = (int)a.a(var4.a[0]);
            n.a.m = (int)a.a(var4.a[1]);
         }

         n.a.a(2, var1, this.f, this.g + 3, 20);
         n.a.a(n.a.append(n.a.l));
         n.a.a(3 * this.f + 2, this.g + 3, var1);
         this.e = 10 + n.a.c;
         n.a.a(3, var1, this.e + 2 * this.f, this.g + 2, 20);
         n.a.a(n.a.append(n.a.m));
         n.a.a(this.e + 4 * this.f + 2, this.g + 3, var1);
      } else {
         String var2 = k.a[163];
         Object var3 = null;
         String var5;
         if (n.a.k == 4) {
            var2 = k.a[51];
            var5 = k.a[76];
         } else if (n.a.k == 6) {
            var2 = k.a[224];
            var5 = k.a[86];
         } else if (n.a.k != 3 && n.a.k != -3) {
            if (n.a.k == 7) {
               var2 = k.a[83];
               var5 = k.a[57];
            } else if (n.a.k == 8) {
               var2 = k.a[33];
               var5 = k.a[57];
            } else if (n.a.k == 9) {
               var2 = k.a[18];
               var5 = k.a[57];
            } else if (n.a.k == -2) {
               var2 = g.a[0];
               var5 = k.a[57];
            } else if (n.a.k == -4) {
               var2 = k.a[15];
               var5 = k.a[57];
            } else if (n.a.k == -5) {
               var2 = g.a[1];
               var5 = k.a[57];
            } else if (n.a.k == -6) {
               var2 = k.a[163];
               var5 = null;
            } else if (n.a.k == 10) {
               var2 = k.a[256];
               var5 = k.a[57];
            } else if (n.a.k == 11) {
               var2 = k.a[86];
               var5 = k.a[57];
            } else if (n.a.k == 12) {
               var2 = k.a[32];
               var5 = k.a[57];
            } else if (n.a.k == 13) {
               var2 = k.a[17];
               var5 = k.a[57];
            } else if (n.a.k == 14) {
               var2 = null;
               var5 = k.a[57];
            } else {
               var5 = k.a[57];
            }
         } else {
            var2 = k.a[256];
            var5 = k.a[57];
         }

         if (var2 != null) {
            n.a.a(var2);
            n.a.a(5 + 2 * this.f / 2, n.a.c - n.a.d + 2, var1);
         }

         if (var5 != null) {
            n.a.a(var5);
            n.a.a(7 * this.f, 7 * this.f, 1, 1);
            n.a.a(n.a.b - 19, n.a.c - n.a.d + 2, var1);
         }

      }
   }
}
