import javax.microedition.lcdui.Graphics;

public abstract class n {
   public static StringBuffer a;
   public static r a;
   public static r b;
   public int a = -1;
   public int b = -1;
   public int c = -1;
   public int d = -1;
   public static k a;
   public boolean a;

   public n(k var1) {
      a = var1;
      if (a == null) {
         a = new StringBuffer();
         a = a.a.a(k.a[14]);
         b = a.b.a(k.a[14]);
      }

   }

   public void a(Graphics var1) {
   }

   public static void a(Graphics var0, int var1, int var2, int var3, int var4, int var5) {
      var0.drawRect(var1, var2, var3, var4);
      if (var5 > 1) {
         for(int var6 = var5 - 1; var6 > 0; --var6) {
            var0.drawRect(var1 + var6, var2 + var6, var3 - 2 * var6, var4 - 2 * var6);
         }
      }

   }

   public void e(int var1) {
   }

   public h a(int var1) {
      return null;
   }

   public void a(int var1) {
   }

   public void b(int var1) {
   }

   public void d(int var1) {
   }

   public void c(int var1) {
   }

   public boolean a() {
      return false;
   }

   public final void a() {
      this.a = false;
      this.a = -1;
      this.b = -1;
      this.c = -1;
      this.d = -1;
   }
}
