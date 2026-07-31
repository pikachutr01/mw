import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.Image;

public final class r {
   private final Image a;
   private short[] b;
   private byte[] a;
   public final int a;
   private int e;
   private final int f;
   public int b;
   public int c;
   public int d;
   private short[] c;
   private int[] a;
   private final byte[] b;
   private final short[] d;
   public final short[] a;
   private int g;
   private int h = 0;
   private int i = 0;
   private int j = 0;
   private int k = 0;
   private boolean a = false;
   private b a;
   private StringBuffer a;
   private static StringBuffer b = new StringBuffer();
   private boolean b;

   public r(b var1, String var2) {
      this.a = var1;
      this.a = var1.a;
      this.b = var1.a;
      this.f = var1.b;
      this.c = new short[70];
      this.d = new short[70];
      this.a = new short[70];
      this.e = 1;
      this.a = this.a.a;
      this.a = new int[500];
      this.b = new short[500];
      this.a = new byte[500];
      this.a(var2);
   }

   public final void a(String var1) {
      b.setLength(0);
      b.append(var1);
      this.a(b);
   }

   public final void a(StringBuffer var1) {
      this.a = var1;
      this.d = 0;
      this.g = 20;
      k.a(var1);

      int var2;
      for(int var4 = (var2 = var1.length()) - 1; var4 >= 0; --var4) {
         char var3;
         if ((var3 = this.a.charAt(var4)) == '\n') {
            this.a[var4] = -2;
         } else {
            this.a[var4] = this.a.a.indexOf(var3);
         }
      }

      short var10 = 0;
      short var5 = 0;
      short var6 = 0;

      for(int var9 = 0; var9 < var2; ++var9) {
         int var8;
         if ((var8 = this.a[var9]) != -1) {
            if (var8 == -2) {
               if (var10 > var5) {
                  var5 = var10;
               }

               this.d[var6] = (short)var9;
               this.c[var6] = var10;
               var10 = 0;
               this.a[var9] = -2;
               ++var6;
            } else {
               this.b[var9] = this.a.a[var8];
               byte var7 = this.a.a[var8];
               this.a[var9] = var7;
               var10 = (short)(var10 + var7);
            }
         }
      }

      this.c[var6] = var10;
      if (var10 > var5) {
         var5 = var10;
      }

      this.d = var6 + 1;
      this.b = this.d * (this.a.a + 1) - 1;
      this.c = var5;
   }

   public final void a(int var1, int var2, Graphics var3) {
      int var6 = var3.getClipX();
      int var7 = var3.getClipY();
      int var8 = var3.getClipWidth();
      int var9 = var3.getClipHeight();
      int var10 = var6 + var8;
      int var11 = var1;
      boolean var12 = this.g == 8;
      boolean var13;
      if (var13 = this.g == 1) {
         var1 -= this.c[0] / 2;
      } else if (var12) {
         var1 -= this.c[0];
      }

      int var14 = 0;

      for(int var15 = 0; var15 < this.a.length(); ++var15) {
         byte var4;
         if ((var4 = this.a[var15]) != 0) {
            if (var4 < 0) {
               ++var14;
               this.a[var14] = (short)var15;
               if (this.j > var15) {
                  this.k = var14;
               }

               if (var13) {
                  var1 = var11 - this.c[var14] / 2;
               } else if (var12) {
                  var1 = var11 - this.c[var14];
               } else {
                  var1 = var11;
               }

               if (var14 > this.h && var14 <= this.i || !this.a) {
                  var2 += this.a + this.e;
               }
            } else if (var1 < var10 && (var14 >= this.h && var14 <= this.i || !this.a)) {
               var3.clipRect(var1, var2, var4, this.a);
               int var5 = var1 - this.b[var15];
               var3.drawImage(this.a, var5, var2, 20);
               var1 += var4;
               var3.setClip(var6, var7, var8, var9);
            }
         }
      }

      if (this.b) {
         this.a.setLength(0);
      }

      this.b = true;
   }

   public final void a(int var1, int var2, int var3, int var4) {
      this.g = var4;
      this.e = var3;
      int var5 = 0;
      short var6 = 0;
      short var7 = 0;
      int var8 = -1;
      short var9 = 0;
      int var10 = 0;

      for(int var13 = 0; var13 < this.a.length(); ++var13) {
         byte var11;
         if ((var11 = this.a[var13]) == -3) {
            var11 = this.b[this.a[var13]];
            this.a[var13] = var11;
         } else if (var11 == -2) {
            this.c[var5] = var6;
            if (var6 > var7) {
               var7 = var6;
            }

            var10 = var13 + 1;
            ++var5;
            var6 = 0;
            continue;
         }

         if (this.a[var13] == this.f) {
            var8 = var13;
            var9 = var6;
         }

         if ((var6 = (short)(var6 + var11)) > var1 && var8 > var10) {
            this.a[var8] = -3;
            var10 = var8 + 1;
            this.c[var5] = (short)var9;
            if (var9 > var7) {
               var7 = (short)var9;
            }

            var6 -= var9;
            ++var5;
         }

         var1 = var2;
      }

      this.c[var5] = var6;
      if (var6 > var7) {
         var7 = var6;
      }

      this.d = var5 + 1;
      this.c = var7;
      this.b = this.d * (this.a + var3) - var3;
   }

   public final int a(int var1, int var2, int var3, int var4, int var5, Graphics var6) {
      this.h = var3;
      this.i = var4;
      this.j = var5;
      this.a = true;
      this.a(var1, var2, var6);
      return this.k;
   }

   public final void a(StringBuffer var1, boolean var2) {
      this.b = var2;
      this.a(var1);
   }

   public final short a(int var1, int var2) {
      short var3 = 0;

      for(int var5 = var1 > 0 ? this.a[var1] + 1 : this.a[var1]; var5 < var2; ++var5) {
         var3 = (short)(var3 + this.a[var5]);
      }

      return var3;
   }
}
