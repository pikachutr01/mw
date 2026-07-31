import javax.microedition.lcdui.Graphics;

public final class d {
   public int a = 0;
   public boolean a = false;
   private static k a;
   public String a;
   public StringBuffer a;
   public int b = 1;
   public int c;
   public String b;
   private static r a;
   private static r b;

   public d(k var1, r var2, r var3) {
      a = var2;
      b = var3;
      a = var1;
      this.a = new StringBuffer();
   }

   public final void a(Graphics var1) {
      byte var2 = 0;
      int var3 = a.b - 6;
      if (this.a) {
         a.a(var1, 3, 0, var3, 1);
         if (this.b == 2) {
            var1.setColor(255, 255, 255);
            var1.fillRect(var3 - 38, 2, 38, 11);
            var1.setColor(100, 100, 100);
            var1.drawRect(var3 - 38, 1, 38, 12);
         }
      }

      if (this.b == 2 && this.a.length() > 0) {
         if (this.a) {
            b.a(this.a, false);
            b.a(38, 38, 2, 1);
            b.a(var3 - 19, 1, var1);
         } else {
            a.a(this.a, false);
            a.a(38, 38, 2, 1);
            a.a(var3 - 19, 1, var1);
         }
      }

      var2 = 5;
      if (this.b == 3) {
         var1.setColor(255, 255, 255);
         var1.fillRect(4, 2, 13, 11);
         var1.setColor(100, 100, 100);
         var1.drawRect(4, 1, 13, 12);
         if (this.a.length() > 0) {
            a.a(4, var1, 5, 3, 20);
         }

         var2 = 19;
      }

      if (this.b == 4) {
         var1.setColor(255, 255, 255);
         var1.fillRect(a.b - 20, 2, 13, 11);
         var1.setColor(100, 100, 100);
         var1.drawRect(a.b - 21, 1, 13, 12);
         if (this.a.length() > 0) {
            a.a(4, var1, a.b - 20, 3, 20);
         }

         var2 = 19;
      }

      if (this.a > 0) {
         a.a(this.a, var1, 5, 1, 20);
         if (this.b != null) {
            b.a(this.b);
            b.a(12, 12, 0, 1);
            b.a(11, 1, var1);
         }

         var2 = 20;
      }

      if (this.a) {
         a.a(this.a);
         a.a(a.b, a.b, 2, 20);
         a.a(var2, 1, var1);
      } else {
         a.a(this.a);
         a.a(a.b, a.b, 2, 20);
         a.a(var2, 1, var1);
      }
   }

   public final void a(int var1, int var2) {
      this.b = var1;
      this.c = var2;
   }

   public final void a(int var1) {
      if (this.b != 3 && this.b != 4) {
         if ((var1 == 42 || var1 == -8) && this.a.length() > 0) {
            this.a.setLength(this.a.length() - 1);
         } else {
            if (6 > this.a.length() && var1 >= 48 && var1 <= 57) {
               this.a.append(var1 - 48);
            }

         }
      } else {
         if (var1 >= 48 && var1 <= 57) {
            if (this.a.length() == 0) {
               this.a.append(1);
               return;
            }

            this.a.setLength(0);
         }

      }
   }
}
