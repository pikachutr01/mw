import javax.microedition.lcdui.Graphics;

public final class m extends n {
   public int e = 1;
   private Graphics a;
   private h a;
   private int f = 0;
   private StringBuffer b;
   private static r c;
   private long a = 0L;
   private long b = 0L;
   private int g = 0;
   private static final int[] a = new int[]{0, 2, 13, 22, 29, 40, 47, 56, 67, 76, 85};
   private static final int[] b = new int[]{0, 1, 12, 19, 26, 33, 40, 47, 56, 63, 73};
   public boolean b;
   private int h = 0;
   private int i = 0;
   private int j;
   private int k;
   private int l;

   public m(k var1) {
      super(var1);
      if (c == null) {
         c = l.c;
      }

   }

   public final void a(Graphics var1) {
      this.a = var1;
      var1.setClip(0, 0, n.a.b, n.a.c);
      var1.translate(super.a, super.b);
      n.a.b(var1, 0, 6, super.c, super.d - 7, 1);
      n.a.a(var1, 0, 0, super.c, 17, 2);
      n.a.a(this.a.a(k.a[22]));
      n.a.a(super.c, super.c, 2, 1);
      n.a.a(super.c / 2, 2, var1);
      this.j = (super.d - n.a.d - 9) / (n.a.a + 2);
      if (n.a.b > 150) {
         var1.translate(0, n.b.b + 10);
      } else {
         var1.translate(0, n.b.b + 6);
      }

      if (this.e == 1) {
         this.b();
      } else if (this.e == 2) {
         this.c();
      } else if (this.e == 3) {
         this.d();
      } else if (this.e == 4) {
         this.e();
      } else {
         if (this.e == 5) {
            this.f();
         }

      }
   }

   private void b() {
      this.a.translate(0, 10);
      h var1 = this.a.a(1);
      h var2 = this.a.a(2);
      h var3 = this.a.a(3);
      int var4 = (Integer)var1.a(k.a[118]) * 8 + 5;
      n.a.a(n.a.append(var1.a(k.a[21])).append(k.a[4]));
      int var5 = (super.c - (n.a.c + var4 + 4)) / 2;
      n.a.a(var5, 0, this.a);
      int var6 = var5 + n.a.c + 4;
      this.a(var6, var4, 0);
      n.a.setLength(0);
      n.b.a((StringBuffer)var1.a(k.a[36]), false);
      n.b.a(var4, var4, 2, 1);
      n.b.a(var6 + var4 / 2, 1, this.a);
      this.a.translate(0, n.b.b + 4);
      int var9 = 0;
      n.a.a(var2.a(k.a[36]));
      int var8 = n.a.c;
      n.a.a(var3.a(k.a[36]));
      var9 = n.a.c;
      int var7 = 0;
      var7 = 24 + var8 + var9 + 9;
      int var10 = (super.c - var7) / 2;
      n.a.a(2, this.a, var10, 3, 20);
      n.a.a(var2.a(k.a[36]));
      var10 += 14;
      n.a.a(var10, 5, this.a);
      var10 = var10 + var8 + 5;
      n.a.a(3, this.a, var10, 3, 20);
      n.a.a(var3.a(k.a[36]));
      n.a.a(var10 + 14, 5, this.a);
      this.a.translate(0, 22);
      n.a.k = 2;
   }

   private void c() {
      c.a(this.b, false);
      c.a(super.c - 12, super.c - 12, 2, 4);
      this.g();
      int var1 = this.k - this.k % this.j;
      c.a(6, 3, var1, var1 + this.j - 1, this.k, this.a);
      int var2 = c.a(this.k, this.i) + 6;
      int var3 = this.k % this.j * (c.a + 2) + 3;
      this.a.setColor(250, 190, 0);
      this.a.drawLine(var2, var3, var2, var3 + 10);
      int var4;
      if ((var4 = 5 * this.k) > super.d - 45) {
         var4 = super.d - 45;
      }

      this.a.drawRegion(n.a.a, 135, 95, 3, 16, 0, super.c - 3, var4, 20);
   }

   private void d() {
      h var1 = this.a.a(1);
      h var2 = this.a.a(2);
      h var3 = this.a.a(3);
      h var4 = this.a.a(4);
      n.a.a(n.a.append(var1.a(k.a[21])).append(k.a[4]));
      n.a.a(6, 0, this.a);
      this.a.translate(0, 15);
      this.a(6, super.c - 12, 0);
      n.a.setLength(0);
      n.a.append(var1.a(k.a[36]));
      n.b.a(n.a);
      n.b.a(super.c - 12, super.c - 12, 2, 1);
      n.b.a(6 + (super.c - 12) / 2, -1, this.a);
      this.a.translate(0, 15);
      n.a.a(n.a.append(var2.a(k.a[21])).append(k.a[4]));
      n.a.a(6, 0, this.a);
      n.a.a(n.a.append(var3.a(k.a[21])).append(k.a[4]));
      n.a.a(37, 0, this.a);
      n.a.a(n.a.append(var4.a(k.a[21])).append(k.a[4]));
      n.a.a(68, 0, this.a);
      this.a.translate(0, 14);
      this.a(6, 18, 1);
      n.b.a((StringBuffer)var2.a(k.a[36]), false);
      n.b.a(18, 18, 2, 1);
      n.b.a(15, -1, this.a);
      this.a(37, 23, 2);
      n.b.a((StringBuffer)var3.a(k.a[36]), false);
      n.b.a(23, 23, 2, 1);
      n.b.a(48, -1, this.a);
      this.a(68, 18, 3);
      n.b.a((StringBuffer)var4.a(k.a[36]), false);
      n.b.a(18, 18, 2, 1);
      n.b.a(77, -1, this.a);
      this.a.translate(0, 25);
   }

   private void e() {
      int var5 = n.a.a.b;
      boolean var6 = false;
      if (var5 == 16 || var5 == 62 || var5 == 95 || var5 == 108 || var5 == 135 || var5 == 137 || var5 == 142) {
         var6 = true;
      }

      for(int var7 = 1; var7 < this.a.a; ++var7) {
         h var8;
         int var1 = (Integer)(var8 = this.a.a(var7)).a(k.a[118]) * k.a + 5;
         int var4 = (Integer)var8.a(k.a[164]);
         if (var6) {
            var1 = super.c - 12;
         }

         n.a.setLength(0);
         n.a.append(var8.a(k.a[21]));
         if (var4 != 5) {
            n.a.append(k.a[4]);
         }

         n.a.a(n.a);
         int var2;
         int var3;
         if (super.a == 0) {
            n.a.a(n.a.b, n.a.b, 0, 1);
            var2 = n.a.b / 2;
            var3 = (n.a.b - var1) / 2;
         } else {
            var2 = 6;
            var3 = 6;
         }

         n.a.a(var2, -2, this.a);
         this.a.translate(0, 13);
         if (var4 != 5) {
            this.a(var3, var1, var7 - 1);
            if (var4 == 4) {
               n.a.a(102, this.a, var3 - 20, -2, 20);
               n.a.a(103, this.a, var3 + var1 + 4, -2, 20);
            }

            n.b.a((StringBuffer)var8.a(k.a[36]), false);
            n.b.a(var1, var1, 0, 1);
            n.b.a(var3 + var1 / 2, -1, this.a);
            this.a.translate(0, 17);
         }
      }

      n.a.k = 2;
   }

   private void f() {
      h var1 = this.a.a(1);
      h var2 = this.a.a(2);
      int var3 = 0;
      int var4 = 0;
      int var5 = 0;

      for(int var7 = 3; var7 < this.a.a; ++var7) {
         h var6 = this.a.a(var7);
         n.a.a(n.a.append(var6.a(k.a[21])).append(k.a[4]));
         var3 = n.a.c;
         n.a.setLength(0);
         n.a.a(n.a.append(var6.a(k.a[35])));
         var4 = n.a.c;
         var5 = (super.c - var3 - var4 - 3) / 2;
         n.a.a(var5 + var3 + 5, 0, this.a);
         n.a.a(n.a.append(var6.a(k.a[21])).append(k.a[4]));
         n.a.a(var5, 0, this.a);
         this.a.translate(0, n.a.b + 1);
      }

      this.a.translate(0, 4);
      int var12 = (Integer)var1.a(k.a[118]) * k.a + 5;
      n.a.setLength(0);
      if (n.a.l > n.a.m) {
         n.a.a(n.a.append(k.a[3]).append(n.a.l));
      } else {
         n.a.a(n.a.append(k.a[3]).append(n.a.m));
      }

      n.a.setLength(0);
      var5 = (super.c - (var12 + n.a.c)) / 2;
      n.a.a(2, this.a, var5 - 6, -3, 20);
      this.a(var5 + 6 + 2, var12, 0);
      n.b.a((StringBuffer)var1.a(k.a[36]), false);
      n.b.a(var12, var12, 2, 1);
      n.b.a(var5 + 6 + 2 + var12 / 2, 0, this.a);
      n.a.a(n.a.append(k.a[3]).append(n.a.l));
      n.a.a(var5 + 6 + 6 + var12, -1, this.a);
      this.a.translate(0, 20);
      n.a.a(3, this.a, var5 - 6, -3, 20);
      this.a(var5 + 6 + 2, var12, 1);
      n.b.a((StringBuffer)var2.a(k.a[36]), false);
      n.b.a(var12, var12, 2, 1);
      n.b.a(var5 + 6 + 2 + var12 / 2, 0, this.a);
      n.a.a(n.a.append(k.a[3]).append(n.a.m));
      n.a.a(var5 + 6 + 6 + var12, -1, this.a);
      this.a.translate(0, 22);
      if (n.a.b > 150) {
         n.a.a(n.a.append(n.a.a()).append(" þehrinden ").append(n.a.f.a(k.a[135])).append(k.a[0]).append(n.a.f.a(k.a[123])).append(k.a[1]).append(" koordinatýna ordu göndereceksiniz. Emin misiniz!"));
         n.a.a(n.a.b - 10, n.a.b - 10, 2, 1);
         n.a.a(n.a.b / 2, 1, this.a);
      }

      n.a.k = 6;
   }

   private void a(int var1, int var2, int var3) {
      this.a.setColor(150, 150, 150);
      this.a.drawRect(var1 - 1, -3, var2 + 1, n.a.a + 4);
      this.a.setColor(255, 255, 255);
      if (this.f == var3) {
         this.a.fillRect(var1, -2, var2, n.a.a + 3);
         this.a.setColor(235, 10, 10);
         n.a(this.a, var1 - 1, -3, var2 + 1, n.a.a + 4, 2);
      } else {
         if ((this.f <= 0 || var3 <= 0 || var3 == this.f) && this.e != 5 && this.e != 4) {
            this.a.setColor(192, 192, 192);
         }

         this.a.fillRect(var1, -2, var2, n.a.a + 3);
      }
   }

   public final void d(int var1) {
      if (var1 == 52) {
         this.e(var1);
      } else if (this.e == 2) {
         this.i = this.i > 0 ? this.i - 1 : 0;
      } else {
         if (this.e == 3) {
            if (this.f > 0) {
               this.f = --this.f % 3;
               this.f = this.f == 0 ? 3 : this.f;
               return;
            }
         } else if (this.e == 4) {
            h var2;
            if ((Integer)(var2 = this.a.a(this.f + 1)).a(k.a[164]) == 4) {
               this.b = (StringBuffer)var2.a(k.a[36]);
               int var4 = Integer.parseInt(this.b.toString());
               --var4;
               int var8;
               var4 = (var8 = var4 % (n.a.z + 1)) == 0 ? n.a.z : var8;
               this.b.setLength(0);
               this.b.append(var4);
               return;
            }
         } else if (this.e == 5) {
            int var3;
            int var6;
            int var10;
            if ((var6 = Integer.parseInt(this.a.a(3).a(k.a[35]))) < n.a.m + n.a.l) {
               var3 = var6 / 2 >= n.a.l ? n.a.l : var6 / 2;
               var10 = var6 - var3 >= n.a.m ? n.a.m : var6 / 2;
            } else {
               var3 = n.a.l;
               var10 = n.a.m;
            }

            h var5 = this.a.a(1);
            this.b = (StringBuffer)var5.a(k.a[36]);
            this.b.setLength(0);
            this.b.append(var3);
            var5 = this.a.a(2);
            this.b = (StringBuffer)var5.a(k.a[36]);
            this.b.setLength(0);
            this.b.append(var10);
         }

      }
   }

   public final void c(int var1) {
      if (var1 == 54) {
         this.e(var1);
      } else if (this.e == 2) {
         if (System.currentTimeMillis() - this.a < 1000L) {
            this.a = System.currentTimeMillis() - 2000L;
         } else {
            this.i = this.i < this.b.length() ? this.i + 1 : this.b.length();
         }
      } else {
         if (this.e == 3) {
            if (this.f > 0) {
               this.f = ++this.f % 4;
               this.f = this.f == 0 ? 1 : this.f;
               return;
            }
         } else if (this.e == 4) {
            h var2;
            if ((Integer)(var2 = this.a.a(this.f + 1)).a(k.a[164]) == 4) {
               this.b = (StringBuffer)var2.a(k.a[36]);
               int var4 = Integer.parseInt(this.b.toString());
               ++var4;
               int var8;
               var4 = (var8 = var4 % (n.a.z + 1)) == 0 ? 1 : var8;
               this.b.setLength(0);
               this.b.append(var4);
               return;
            }
         } else if (this.e == 5) {
            h var5 = this.a.a(1);
            this.b = (StringBuffer)var5.a(k.a[36]);
            this.b.setLength(0);
            this.b.append(0);
            var5 = this.a.a(2);
            this.b = (StringBuffer)var5.a(k.a[36]);
            this.b.setLength(0);
            this.b.append(0);
         }

      }
   }

   public final void b(int var1) {
      if (var1 == 50) {
         this.e(var1);
      } else {
         if (this.e == 2) {
            if (this.k > 0) {
               --this.k;
               this.i = c.a[this.k] + (this.i - c.a[this.k + 1]);
               if (this.i > c.a[this.k + 1]) {
                  this.i = c.a[this.k + 1] - 1;
                  return;
               }
            }
         } else {
            if (this.e == 3 || this.e == 5) {
               this.f = this.f == 0 ? 1 : 0;
               return;
            }

            if (this.e == 4) {
               this.a = 0L;
               this.a();
               this.f = this.f == 0 ? this.a.a - 2 : (this.f - 1) % (this.a.a - 1);
            }
         }

      }
   }

   public final void a(int var1) {
      if (var1 == 56) {
         this.e(var1);
      } else {
         if (this.e == 2) {
            if (this.k + 1 < c.d) {
               ++this.k;
               this.i = c.a[this.k] + (this.i - c.a[this.k - 1]);
               if (this.i >= this.b.length()) {
                  this.i = this.b.length();
                  return;
               }
            }
         } else {
            if (this.e == 3 || this.e == 5) {
               this.f = this.f == 0 ? 1 : 0;
               return;
            }

            if (this.e == 4) {
               this.a = 0L;
               this.a();
               this.f = (this.f + 1) % (this.a.a - 1);
            }
         }

      }
   }

   public final h a(int var1) {
      if (var1 == 53) {
         this.e(var1);
         return null;
      } else {
         if (this.e == 3) {
            h var2 = this.a.a(1);
            h var3 = this.a.a(2);
            h var4 = this.a.a(3);
            h var5 = this.a.a(4);
            n.a.setLength(0);
            if (this.f == 0) {
               this.a.a((Object)n.a.append(k.a[124]).append((StringBuffer)var2.a(k.a[36])), (String)k.a[136]);
            } else {
               this.a.a((Object)n.a.append(k.a[171]).append((StringBuffer)var3.a(k.a[36])).append(k.a[4]).append((StringBuffer)var4.a(k.a[36])).append(k.a[4]).append((StringBuffer)var5.a(k.a[36])), (String)k.a[136]);
            }
         } else if (this.e == 4) {
            this.a = 0L;
            this.a();
         }

         return this.a;
      }
   }

   public final void e(int var1) {
      String var2;
      int[] var3;
      if (this.b) {
         var2 = "01.,!:;)(_-+abcABC2defDEF3ghiGHI4jklJKL5mnoMNO6pqrsPQRS7tuvTUV8wxyzWXYZ9";
         var3 = b;
      } else {
         var2 = " 01.,!:;)(_-+abcçABCÇ2defDEF3gðhýiGÐHIÝ4jklJKL5mnoöMNOÖ6pqrsþPQRSÞ7tuüvTUÜV8wxyzWXYZ9";
         var3 = a;
      }

      h var4;
      int var5 = (Integer)(var4 = this.a.a(this.f + 1)).a(k.a[164]);
      int var6 = (Integer)var4.a(k.a[118]);
      this.b = (StringBuffer)var4.a(k.a[36]);
      if (n.a.b == 1) {
         this.b.deleteCharAt(this.i - 1);
         this.b.insert(this.i - 1, var1 - 48);
      } else {
         if (this.e != 2) {
            this.i = this.b.length();
         }

         if (var5 != 1 && var5 != 4) {
            if (var5 == 2 || var5 == 3) {
               if (var1 >= 48 && var1 <= 57) {
                  if (this.l == this.f && System.currentTimeMillis() - this.a <= 1000L && this.h == var1 - 48) {
                     if (this.h == var1 - 48) {
                        int var8 = var3[var1 - 48 + 1] - var3[var1 - 48];
                        if (this.g < var8 - 1) {
                           ++this.g;
                        } else {
                           this.g = 0;
                        }

                        this.b.deleteCharAt(this.i - 1).insert(this.i - 1, var2.charAt(var3[var1 - 48] + this.g));
                     }
                  } else {
                     if (this.b.length() >= var6) {
                        return;
                     }

                     if (this.i > 0 && this.b != 0L && var5 == 3) {
                        ((StringBuffer)var4.a(k.a[227])).append(this.b.charAt(this.b.length() - 1));
                        this.b.setCharAt(this.b.length() - 1, '*');
                     }

                     this.g = 0;
                     this.b.insert(this.i, var2.charAt(var3[var1 - 48]));
                     ++this.i;
                  }

                  this.a = System.currentTimeMillis();
                  this.h = var1 - 48;
                  this.l = this.f;
                  if (var5 == 3) {
                     this.b = this.a;
                     return;
                  }
               } else if ((var1 == 42 || var1 == -8) && this.i > 0) {
                  if (this.e == 2) {
                     this.b.deleteCharAt(this.i - 1);
                  } else {
                     this.b.deleteCharAt(this.b.length() - 1);
                     StringBuffer var7;
                     if (var5 == 3 && (var7 = (StringBuffer)var4.a(k.a[227])).length() > 0) {
                        var7.deleteCharAt(var7.length() - 1);
                     }
                  }

                  --this.i;
               }
            }
         } else {
            if ((var1 == 42 || var1 == -8) && this.b.length() > 0) {
               this.b.deleteCharAt(this.b.length() - 1);
               return;
            }

            if (var6 > this.b.length() && var1 >= 48 && var1 <= 57) {
               this.b.append(var1 - 48);
               return;
            }
         }

      }
   }

   public static h a(int var0, int var1, String var2, StringBuffer var3) {
      h var4 = null;
      if (var0 != 3) {
         var4 = new h(4);
      } else {
         var4 = new h(5);
      }

      var4.a((String)k.a[164], (Object)(new Integer(var0)));
      var4.a((String)k.a[118], (Object)(new Integer(var1)));
      var4.a((String)k.a[21], (Object)var2);
      if (var3 != null) {
         if (var0 == 3) {
            var4.a((String)k.a[227], (Object)var3);
            StringBuffer var5 = new StringBuffer();

            for(int var6 = 0; var6 < var3.length(); ++var6) {
               var5.append('*');
            }

            var4.a((String)k.a[36], (Object)var5);
         } else {
            var4.a((String)k.a[36], (Object)var3);
         }
      } else {
         var4.a((String)k.a[36], (Object)(new StringBuffer()));
         if (var0 == 3) {
            var4.a((String)k.a[227], (Object)(new StringBuffer()));
         }
      }

      return var4;
   }

   public static h a(String var0, String var1) {
      h var2;
      (var2 = new h(3)).a((String)k.a[21], (Object)var0);
      var2.a((String)k.a[35], (Object)var1);
      var2.a((String)k.a[36], (Object)(new StringBuffer()));
      return var2;
   }

   public final void a(h var1) {
      this.f = 0;
      this.i = 0;
      this.l = 0;
      this.b = false;
      this.a = var1;
      this.b = (StringBuffer)this.a.a(this.f + 1).a(k.a[36]);
   }

   public final boolean a() {
      try {
         h var1;
         if ((Integer)(var1 = this.a.a(this.f + 1)).a(k.a[164]) == 3 && this.b != 0L && System.currentTimeMillis() > this.a + 1000L) {
            StringBuffer var3 = (StringBuffer)var1.a(k.a[36]);
            StringBuffer var4 = (StringBuffer)var1.a(k.a[227]);
            if (var3.length() > 0) {
               var4.append(var3.charAt(var3.length() - 1));
               var3.setCharAt(var3.length() - 1, '*');
            }

            this.b = 0L;
         }
      } catch (Exception var5) {
      }

      return true;
   }

   private void g() {
      int var1 = c.d;
      int var2 = 0;

      for(var2 = 0; var2 < var1 && this.i > c.a[var2]; ++var2) {
      }

      if (var2 == 0) {
         this.k = 0;
      } else {
         this.k = var2 - 1;
      }
   }
}
