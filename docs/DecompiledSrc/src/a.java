public abstract class a {
   private static int a = 24;
   private static int b = 8;
   private static long a = 16777216L;
   private static long b = 16777215L;
   private static long c = 100000000L;
   private static long d = 0L;
   private static long e = 52707178L;
   private static long[] a;

   public static long a(long var0) {
      return var0 < 0L ? -(a(-var0, 0) >> a) : a(var0, 0) >> a;
   }

   public static long b(long var0) {
      return var0 << a;
   }

   public static long a(String var0) {
      byte var1 = 0;
      if (var0.charAt(0) == '-') {
         var1 = 1;
      }

      String var2 = "-1";
      int var3;
      if ((var3 = var0.indexOf(46)) >= 0) {
         for(var2 = var0.substring(var3 + 1, var0.length()); var2.length() < b; var2 = var2 + "0") {
         }

         if (var2.length() > b) {
            var2 = var2.substring(0, b);
         }
      } else {
         var3 = var0.length();
      }

      long var4 = 0L;
      if (var1 != var3) {
         var4 = Long.parseLong(var0.substring(var1, var3));
      }

      long var6 = Long.parseLong(var2) + 1L;
      long var8 = (var4 << a) + (var6 << a) / c;
      if (var1 == 1) {
         var8 = -var8;
      }

      return var8;
   }

   public static long a(long var0, long var2) {
      return var0 < var2 ? var2 : var0;
   }

   public static long a(long var0, int var2) {
      long var3 = 10L;

      for(int var5 = 0; var5 < var2; ++var5) {
         var3 *= 10L;
      }

      var3 = c(b(5L), b(var3));
      if (var0 < 0L) {
         var3 = -var3;
      }

      return var0 + var3;
   }

   public static long b(long var0, long var2) {
      boolean var4 = false;
      int var5 = a;
      long var6 = b;
      if ((var0 & var6) == 0L) {
         return (var0 >> var5) * var2;
      } else if ((var2 & var6) == 0L) {
         return var0 * (var2 >> var5);
      } else {
         if (var0 < 0L && var2 > 0L || var0 > 0L && var2 < 0L) {
            var4 = true;
         }

         if (var0 < 0L) {
            var0 = -var0;
         }

         if (var2 < 0L) {
            var2 = -var2;
         }

         while(a(var0, var2) >= 1L << 63 - var5) {
            var0 >>= 1;
            var2 >>= 1;
            var6 >>= 1;
            --var5;
         }

         long var8 = (var0 >> var5) * (var2 >> var5) << var5;
         long var10 = ((var0 & var6) * (var2 & var6) >> var5) + ((var0 & ~var6) * (var2 & var6) >> var5);
         if ((var8 = var8 + var10 + ((var0 & var6) * (var2 & ~var6) >> var5) << a - var5) < 0L) {
            throw new ArithmeticException("Overflow");
         } else {
            return var4 ? -var8 : var8;
         }
      }
   }

   public static long c(long var0, long var2) {
      boolean var4 = false;
      int var5 = a;
      if (var2 == a) {
         return var0;
      } else if ((var2 & b) == 0L) {
         return var0 / (var2 >> var5);
      } else {
         if (var0 < 0L && var2 > 0L || var0 > 0L && var2 < 0L) {
            var4 = true;
         }

         if (var0 < 0L) {
            var0 = -var0;
         }

         if (var2 < 0L) {
            var2 = -var2;
         }

         while(a(var0, var2) >= 1L << 63 - var5) {
            var0 >>= 1;
            var2 >>= 1;
            --var5;
         }

         long var6 = (var0 << var5) / var2 << a - var5;
         return var4 ? -var6 : var6;
      }
   }

   public static long d(long var0, long var2) {
      return var0 + var2;
   }

   public static long c(long var0) {
      return var0 < 0L ? -var0 : var0;
   }

   public static long d(long var0) {
      if (var0 == 0L) {
         return a;
      } else {
         boolean var2 = var0 < 0L;
         long var14;
         int var3 = (int)((var14 = c(var0)) >> a);
         long var4 = a;

         for(int var6 = 0; var6 < var3 / 4; ++var6) {
            var4 = b(var4, a[4] >> (int)d);
         }

         if (var3 % 4 > 0) {
            var4 = b(var4, a[var3 % 4] >> (int)d);
         }

         if ((var0 = var14 & b) > 0L) {
            long var7 = a;
            long var9 = 0L;
            long var11 = 1L;

            for(int var13 = 0; var13 < 16; ++var13) {
               var9 += var7 / var11;
               var7 = b(var7, var0);
               if ((var11 *= (long)(var13 + 1)) > var7 || var7 <= 0L || var11 <= 0L) {
                  break;
               }
            }

            var4 = b(var4, var9);
         }

         if (var2) {
            var4 = c(a, var4);
         }

         return var4;
      }
   }

   public static long e(long var0) {
      // $FF: Couldn't be decompiled
   }

   public static long e(long var0, long var2) {
      boolean var4 = var2 < 0L;
      long var5 = a;

      for(int var7 = (int)(var2 = c(var2)) >> a; var7-- > 0; var5 = b(var5, var0)) {
      }

      if (var5 < 0L) {
         throw new ArithmeticException("Overflow");
      } else {
         if (var0 != 0L) {
            var5 = b(var5, d(b(e(var0), var2 & b)));
         } else {
            var5 = 0L;
         }

         return var4 ? c(a, var5) : var5;
      }
   }

   static {
      a = new long[]{a, 45605201L, 123967790L, 336979391L, 916004956L};
   }
}
