import javax.microedition.lcdui.Graphics;

public final class p extends n {
   public h a;
   public int e = 0;
   private int f = 4;
   private int g = 4;

   public p(k var1) {
      super(var1);
      this.g = (n.a.c - n.a.d * 4) / 15;
   }

   public final void a(Graphics var1) {
      int var2;
      int var3;
      if ((var3 = (var2 = this.e - this.e % this.f) + this.f) >= this.a.a) {
         var3 = this.a.a;
      }

      super.d = (this.f + 1) * 15 + 6;
      super.b = (n.a.c - super.d) / 2;
      n.a.b(var1, super.a, super.b, super.c, (this.f + 1) * 15 + 6, 1);
      var1.setColor(255, 210, 0);
      if (var3 != this.a.a) {
         n.a.a(8, var1, super.a - 4 + super.c / 2, super.b + 11 + this.f * 15, 20);
      }

      if (var2 > 0) {
         n.a.a(7, var1, super.a - 4 + super.c / 2, super.b + 4, 20);
      }

      var1.translate(super.a, super.b + 10);

      for(int var5 = var2; var5 < var3; ++var5) {
         h var4 = this.a.a(var5);
         if (this.e == var5) {
            n.a.a(var1, 5, 0, super.c - 10, 1);
            n.a.a(var4.a(k.a[115]));
         } else {
            n.a.a(var4.a(k.a[115]));
         }

         n.a.a(super.c, super.c, 2, 1);
         n.a.a(super.c / 2, 2, var1);
         if (var4.a(k.a[36]) != null) {
            if ((Integer)var4.a(k.a[36]) == 1) {
               n.a.a(4, var1, 7, 3, 20);
            } else {
               n.a.a(6, var1, 7, 3, 20);
            }
         }

         var1.translate(0, 15);
      }

   }

   public final void a(int var1) {
      this.e = ++this.e % this.a.a;
   }

   public final void b(int var1) {
      this.e = --this.e % this.a.a;
      if (this.e == -1) {
         this.e = this.a.a - 1;
      }

   }

   public final h a(int var1) {
      this.a.a(this.e).a((Object)(new Integer(this.e)), (String)k.a[85]);
      return this.a.a(this.e);
   }

   public static h a(String var0, int var1, int var2) {
      h var3;
      (var3 = k.a()).a((String)k.a[115], (Object)var0);
      var3.a((String)k.a[50], (Object)(new Integer(var1)));
      if (var2 != -1) {
         var3.a((String)k.a[36], (Object)(new Integer(var2)));
      }

      return var3;
   }

   public static h a(String var0, int var1) {
      return a(var0, var1, -1);
   }

   public final void a(h var1) {
      this.a = var1;
      this.f = this.a.a;
      if (this.f > this.g) {
         this.f = this.g;
      }

   }
}
