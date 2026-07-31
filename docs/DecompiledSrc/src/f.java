import javax.microedition.lcdui.Graphics;

public final class f extends n {
   private h a;
   private j a;
   private int e;
   private int f;
   private int g;

   public f(k var1) {
      super(var1);
      this.a = var1.a;
      this.e = n.a.j;
      this.a = new j(n.a);
      this.a.a(this.a, k.a[13]);
      this.a.f(2);
      n.a.b = n.a.b().a(0);
      n.a.c(this.e);
   }

   public final void a(Graphics var1) {
      this.e = n.a.j;
      h var3 = null;
      int var8 = 0;
      this.a.f(2);
      n.a.b(var1, 0, 16, n.a.b, n.a.i - 16, 0);
      if (n.a.n > 0 && n.a.k == 1 && n.a.i % 2L == 0L) {
         n.a.a(61, var1, n.a.b - 15, n.a.c - 13, 20);
      }

      var1.translate(super.a, super.b);

      for(int var17 = 0; var17 < this.a.a; ++var17) {
         h var2 = (var3 = this.a.a(var17)).a(0);
         h var5 = var3.a(k.a[122]);
         int var10 = 73;
         if (var5 != null) {
            for(int var18 = 0; var18 < var5.a; ++var18) {
               h var6;
               if ((Integer)(var6 = var5.a(var18)).a(k.a[26]) != 1) {
                  int var19;
                  if ((var19 = (Integer)var6.a(k.a[73])) != 3 && var19 != 4) {
                     var10 = 74;
                     break;
                  }

                  var10 = 115;
               }
            }
         }

         int var14;
         var14 = (var14 = (n.a.i - var1.getTranslateY() - 33) / 22) < 2 ? 2 : var14;
         if (this.e == var17) {
            if (var3.a(k.a[122]) == null) {
               this.g = 1;
            } else {
               this.g = var3.a(k.a[122]).a + 1;
            }

            this.f %= this.g;
            var1.setColor(0, 204, 255);
         }

         n.a.append(var2.a(k.a[189]));
         n.a.setLength(3);
         if (this.e == var17 && this.f == 0) {
            n.a.a(80, var1, var8 - 4, -2, 20);
            n.a.a(n.a);
            n.a.a(16, 16, 2, 1);
            n.a.a(var8 + 8, 19, var1);
         } else {
            n.b.a(n.a);
            n.b.a(16, 16, 2, 1);
            n.b.a(var8 + 8, 19, var1);
         }

         n.a.a(var10, var1, var8, 0, 20);
         var1.translate(0, 16 + n.a.b + 7);
         if (var3.a(k.a[122]) != null) {
            int var15 = this.f - 1;
            int var16 = var3.a(k.a[122]).a;
            if (this.e == var17) {
               var15 -= var15 % var14;
               var16 = var16 < var15 + var14 ? var16 : var15 + var14;
            } else {
               var15 = 0;
               var16 = var16 > var14 ? var14 : var16;
            }

            ++var15;

            for(; var15 <= var16; ++var15) {
               var10 = (Integer)var3.a(k.a[122]).a(var15 - 1).a(k.a[140]);
               if (this.f == var15 && this.e == var17) {
                  n.a.a(81, var1, var8 - 2, -2, 20);
               }

               n.a.a(var10, var1, var8, 0, 20);
               if (n.a.b > 150) {
                  var1.translate(0, 22);
               } else {
                  var1.translate(0, 18);
               }
            }
         }

         var8 = var8 + 16 + 7;
         var1.translate(0 - var1.getTranslateX() + super.a, 0 - var1.getTranslateY() + super.b);
      }

      if (this.f > 0) {
         h var7 = n.a.a.a(this.e).a(k.a[122]);
         this.a.a = var7.a((this.f - 1) % this.g);
      } else {
         this.a.a = n.a.a.a(this.e).a(0);
      }

      var1.translate(0 - var1.getTranslateX(), 0 - var1.getTranslateY());
      this.a.a(var1);
   }

   public final void a(int var1) {
      this.f = ++this.f % this.g;
      if (this.f > 0) {
         n.a.b = n.a.b().a(k.a[122]).a(this.f - 1);
      } else {
         n.a.b = n.a.b().a(this.f);
      }
   }

   public final void b(int var1) {
      this.f = --this.f % this.g;
      if (this.f < 0) {
         this.f = this.g - 1;
      }

      if (this.f > 0) {
         n.a.b = n.a.b().a(k.a[122]).a(this.f - 1);
      } else {
         n.a.b = n.a.b().a(this.f);
      }
   }

   public final void c(int var1) {
      this.e = ++this.e % n.a.c();
      this.f = 0;
      n.a.c(this.e);
   }

   public final void d(int var1) {
      this.e = --this.e % n.a.c();
      this.f = 0;
      if (this.e < 0) {
         this.e = n.a.c() - 1;
      }

      n.a.c(this.e);
   }

   public final h a(int var1) {
      h var2 = k.a();
      if (this.f > 0) {
         var2.a((String)k.a[50], (Object)(new Integer(27)));
      } else {
         var2.a((String)k.a[50], (Object)(new Integer(11)));
      }

      return var2;
   }

   public final boolean a() {
      n.a.b();
      return true;
   }
}
