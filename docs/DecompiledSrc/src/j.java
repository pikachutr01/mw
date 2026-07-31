import javax.microedition.lcdui.Graphics;

public final class j extends n {
   private int e = 1;
   private String a;
   private Graphics a;
   public h a;
   private boolean b = false;
   private int f = 0;

   public j(k var1) {
      super(var1);
   }

   public final void a(h var1, String var2) {
      this.a = var2;
      this.a = var1;
   }

   public final void a(Graphics var1) {
      if (this.a != null) {
         this.a = var1;
         this.f(this.e);
         if (this.e != 1 && this.e != 4) {
            if (this.e != 2 && this.e != 5) {
               if (this.e == 3) {
                  this.d();
               } else if (this.e == 6) {
                  this.e();
               } else if (this.e == 7) {
                  this.f();
               } else if (this.e == 8) {
                  this.g();
               } else if (this.e == 9) {
                  this.h();
               } else if (this.e == 10) {
                  this.i();
               } else if (this.e == 11) {
                  this.j();
               } else {
                  if (this.e == 12) {
                     this.k();
                  }

               }
            } else {
               this.c();
            }
         } else {
            this.b();
         }
      } else {
         if (this.e == 2 || this.e == 3 || this.e == 6 || this.e == 10 || this.e == 8) {
            n.a.a(var1, 0, n.a.i, n.a.b, super.d - 16, 4);
         }

      }
   }

   private void b() {
      int var1 = (int)this.a.a[0];
      int var2 = 0;
      this.b = false;
      if (this.a.a(k.a[123]) != null && (var2 = Integer.parseInt(this.a.a(k.a[123]))) > 0) {
         this.b = true;
      }

      if (var1 <= 0 && !this.b) {
         this.e = 4;
      } else {
         this.e = 1;
      }

      n.a.a(this.a, 38, n.a.i, n.a.b - 38, super.d - 16, 4);
      int var3;
      int var4 = k.a(var3 = Integer.parseInt(this.a.a(k.a[162])));
      n.a.a(var4, this.a, 2, n.a.i + 1, 20);
      n.a.a(this.a, 0, n.a.i, 38, super.d - 16, -1);
      int var6 = n.a.b - 41;
      int var7 = n.a.i + 2;
      int var8 = 0;
      var8 = (int)n.a.a(this.a, this.a);
      int var9 = (int)n.a.j;
      int var10 = (int)n.a.k;
      if (!this.b) {
         if (var1 == 0 && n.a.b > 150) {
            boolean var11 = false;
            if (this.a.compareTo(k.a[19]) == 0) {
               n.a.a(n.a.append(k.a[55]).append(n.a.b[n.a.b(var3)]));
               var11 = true;
            } else if (var3 != 65 && var3 != 68 && var3 != 69) {
               if (this.a.compareTo(k.a[19]) != 0 && var3 != 61 && var3 != 66 && var3 != 67 && var3 != 23) {
                  if (this.a.compareTo(k.a[161]) == 0) {
                     n.a.a(n.a.append(k.a[266]).append(n.a.b[n.a.b(var3)]));
                     var11 = true;
                  } else if (this.a.compareTo(k.a[143]) == 0) {
                     n.a.a(n.a.append(k.a[267]).append(n.a.b[n.a.b(var3)]));
                     var11 = true;
                  }
               } else {
                  n.a.a(n.a.append(k.a[56]).append(n.a.b[n.a.b(var3)]));
                  var11 = true;
               }
            } else {
               n.a.a(n.a.append(k.a[265]).append(n.a.b[n.a.b(var3)]));
               var11 = true;
            }

            if (var11) {
               n.a.a(var6, var6, 2, 1);
               n.a.a(41 + var6 / 2, var7, this.a);
               var7 += n.a.b;
            } else {
               var7 += 6;
            }
         }

         n.a.a(k.a(var8, n.a.append(k.a[182])));
      } else if (var3 == 65) {
         if (var2 == 11) {
            n.a.a(k.a[44]);
         } else if (var2 == 12) {
            n.a.a(k.a[27]);
         } else if (var2 == 17) {
            n.a.a(k.a[269]);
         }
      } else if (var3 == 68 && var2 == 15) {
         n.a.a(k.a[270]);
      }

      String var18;
      if (this.a.compareTo(k.a[161]) == 0 && (var18 = n.a.b.a(k.a[187])) != null && var18.length() > 0 && n.a.a().compareTo(var18) != 0) {
         n.a.a(var18 + " akademisinde ilerletiliyor");
         n.a.a(var6, var6, 2, 1);
         n.a.a(41 + var6 / 2, var7 + 10, this.a);
      } else {
         n.a.a(var6, var6, 2, 1);
         n.a.a(41 + var6 / 2, var7, this.a);
         this.f = 0;
         if (this.e == 1) {
            var7 = var7 + n.a.b + 3;
            if (this.a.a(k.a[20]) == null || this.a.a(k.a[20]) != null && this.a.a(k.a[20]).compareTo(k.a[188]) == 0) {
               if (!this.b) {
                  this.a(41, var7, (n.a.b - 41) / 2, 5, (int)this.a.a[2] * 100 / var8);
               } else {
                  this.a(41, var7, (n.a.b - 41) / 2, 5, (int)this.a.a[2] * 100 / Integer.parseInt(this.a.a(k.a[52])));
               }
            } else {
               this.a(41, var7, (n.a.b - 41) / 2, 5, 100);
            }

            var7 -= 3;
         }

         if (this.b && var2 != 17 && var2 != 15) {
            if (var2 == 11 || var2 == 12) {
               n.a.a(n.a.append(k.a[196]).append(this.a.a(k.a[49])));
               n.a.a(41 + (var6 - n.a.c) / 2, var7 + n.a.b, this.a);
            }
         } else if (n.a.b <= 150 && this.f == 0 || n.a.b > 150) {
            int var14 = 0;
            n.a.setLength(0);
            n.a.a(n.a.append(var9));
            int var12 = n.a.c;
            n.a.setLength(0);
            n.a.a(n.a.append(var10));
            int var13 = n.a.c;
            int var19 = 0;
            var19 = 24 + var12 + var13 + 2;
            var14 = 41 + (n.a.b - var19 - 41 - 3) / 2;
            n.a.setLength(0);
            if (n.a.b <= 150) {
               var14 = 41 + (n.a.b - var12 - 41 - 12) / 2;
            }

            var7 += n.a.b;
            n.a.a(2, this.a, var14, var7, 20);
            n.a.a(n.a.append(var9));
            var14 += 12;
            n.a.a(var14, var7, this.a);
            if (n.a.b <= 150) {
               var14 = 41 + (n.a.b - var13 - 41 - 12) / 2;
               var7 += n.a.b;
            } else {
               var14 = var14 + var12 + 1;
            }

            n.a.a(3, this.a, var14, var7, 20);
            n.a.a(n.a.append(var10));
            n.a.a(var14 + 12, var7, this.a);
            return;
         }

      }
   }

   private void c() {
      n.a.a(this.a, 0, n.a.i, n.a.b, super.d - 16, 4);
      if (this.e == 5) {
         this.a.translate(0, n.a.i + 3);
         String var2;
         if (this.a.a(k.a[49]) == null) {
            var2 = k.a[194];
         } else {
            var2 = k.a[193];
         }

         n.a.a(n.a.append(var2).append(this.a.a(k.a[49])).append(k.a[0]).append(this.a.a(k.a[135])).append(k.a[1]));
         n.a.a(n.a.b, n.a.b, 2, 1);
         n.a.a(n.a.b / 2, 0, this.a);
         if (this.a.a(k.a[49]) != null) {
            this.a.translate(0, n.a.a + 3);
            n.a.a(n.a.append(k.a[87]).append(this.a.a(k.a[91])));
            n.a.a(n.a.b, n.a.b, 2, 1);
            n.a.a(n.a.b / 2, 0, this.a);
         }

      } else {
         this.a.translate(7, n.a.i + 3);
         if (this.a.a(k.a[70]) > -1) {
            if (n.a.b > 150) {
               n.a.append(k.a[192]).append(this.a.a(k.a[70])).append(k.a[8]).append(this.a.a(k.a[46])).append(k.a[9]);
            } else {
               n.a.append(this.a.a(k.a[46])).append(k.a[4]).append(k.a[8]).append(this.a.a(k.a[78])).append(k.a[9]);
            }

            n.a.a(k.a((int)this.a.a[0], n.a).append(k.a[1]));
            n.a.a(0, 0, this.a);
            this.a.translate(0, n.a.a + 3);
            if (n.a.b > 150) {
               if ((Integer)this.a.a(k.a[26]) == 1) {
                  n.a.append(k.a[191]).append(this.a.a(k.a[78]));
                  if (this.a.a(k.a[77]) != null) {
                     n.a.append(k.a[9]).append(this.a.a(k.a[77])).append(k.a[1]);
                  }

                  n.a.a(n.a);
               } else {
                  n.a.a(n.a.append(k.a[190]).append(this.a.a(k.a[78])).append(k.a[9]).append(this.a.a(k.a[77])).append(k.a[1]));
               }

               n.a.a(0, 0, this.a);
               return;
            }
         } else {
            int var1 = 0;
            if (n.a.b().a(k.a[122]) != null) {
               var1 = n.a.b().a(k.a[122]).a;
            }

            if (n.a.b > 150) {
               this.a.translate(0, -3);
               n.a.a(27, this.a, -5, 0, 20);
               n.a.a(this.a, -6, 0, 30, super.d - 16, -1);
               n.a.a(this.a, 24, 0, n.a.b - 24, super.d - 16, -1);
               this.a.translate(0, 3);
               n.a.append(k.a[197]).append(this.a.a(k.a[189]));
               n.a.a(n.a);
               n.a.a(28, 0, this.a);
               this.a.translate(0, n.a.a + 2);
               n.a.a(n.a.append(k.a[125]).append(var1));
               n.a.a(28, 0, this.a);
               return;
            }

            n.a.a(n.a.append(k.a[197]).append(this.a.a(k.a[189])));
            n.a.a(0, 0, this.a);
            n.a.a(n.a.append(k.a[125]).append(var1));
            n.a.a(n.a.b - 50, 0, this.a);
         }

      }
   }

   private void d() {
      n.a.a(this.a, 0, n.a.i, n.a.b, super.d - 16, 4);
      this.a.translate(4, n.a.i + 3);
      if (this.a.a(k.a[123]) != null) {
         n.a.a(n.a.append(k.a[87]).append(this.a.a(k.a[91])));
         n.a.a(4, 0, this.a);
         this.a.translate(0, n.a.a + 2);
         n.a.a(n.a.append(k.a[157]).append(this.a.a(k.a[49])));
         n.a.a(4, 0, this.a);
         this.a.translate(0, n.a.a + 2);
      } else {
         n.a.a(n.a.append(k.a[48]));
         n.a.a(4, 0, this.a);
      }
   }

   private void e() {
      byte var1 = 42;
      if (n.a.b > 150) {
         n.a.a(this.a, 38, n.a.i, n.a.b - 38, super.d - 16, 4);
      } else {
         n.a.a(this.a, 0, n.a.i, n.a.b, super.d - 16, 4);
         var1 = 4;
      }

      int var2 = Integer.parseInt(this.a.a(k.a[162]));
      int var3 = 0;
      if (var2 > 5 && var2 < 11) {
         var3 = 56;
      } else {
         var3 = Integer.parseInt(this.a.a(k.a[54])) == 2 ? 58 : 57;
      }

      if (n.a.b > 150) {
         n.a.a(var3, this.a, 0, n.a.i, 20);
         n.a.a(this.a, 0, n.a.i, 38, super.d - 16, -1);
      }

      n.a.setLength(0);
      k.a(n.a.append(this.a.a(k.a[185])), '|', ' ');
      n.a.a(n.a);
      n.a.a(n.a.b - n.a.c - 4, n.a.i + 3, this.a);
      if (var2 >= 6 && var2 != 11 && var2 != 12) {
         if (var2 != 6 && var2 != 10) {
            if (var2 == 7) {
               n.a.a(n.a.append(this.a.a(k.a[123])).append(" ittifaða bir mesaj gönderdi."));
            } else if (var2 == 8) {
               n.a.a(n.a.append(this.a.a(k.a[123])).append(" size ittifak daveti gönderdi."));
            } else if (var2 == 9) {
               n.a.a(n.a.append(this.a.a(k.a[123])).append(" ittifaðýnýza baþvuru gönderdi."));
            }
         } else {
            n.a.a(n.a.append(this.a.a(k.a[123])).append(" size bir mesaj gönderdi."));
         }

         n.a.a(n.a.b - var1, n.a.b - var1, 0, 1);
         n.a.a(var1 + (n.a.b - 40) / 2, n.a.i + 15, this.a);
      } else {
         if (var2 == 1) {
            if (Integer.parseInt(this.a.a(k.a[54])) == 1) {
               n.a.a(k.a[166]);
            } else {
               n.a.a(k.a[137]);
            }
         } else if (var2 != 2 && var2 != 5 && var2 != 11 && var2 != 12) {
            if (var2 == 3 || var2 == 4) {
               n.a.a(k.a[260]);
            }
         } else if (Integer.parseInt(this.a.a(k.a[54])) == 1) {
            n.a.a(k.a[258]);
         } else {
            n.a.a(k.a[259]);
         }

         n.a.a(var1, n.a.i + 3, this.a);
         if (Integer.parseInt(this.a.a(k.a[177])) == 1) {
            n.a.a(n.a.append(k.a[90]).append(this.a.a(k.a[104])));
            n.a.a(var1, n.a.i + 15, this.a);
            n.a.a(n.a.append(k.a[79]).append(this.a.a(k.a[74])).append(k.a[0]).append(this.a.a(k.a[123])).append(k.a[1]));
            n.a.a(var1, n.a.i + 26, this.a);
         } else {
            n.a.a(n.a.append(k.a[90]).append(this.a.a(k.a[104])).append(k.a[0]).append(this.a.a(k.a[123])).append(k.a[1]));
            n.a.a(var1, n.a.i + 15, this.a);
            n.a.a(n.a.append(k.a[79]).append(this.a.a(k.a[74])));
            n.a.a(var1, n.a.i + 26, this.a);
         }
      }
   }

   private void f() {
      n.a.a(this.a, 0, n.a.i, n.a.b, super.d - 16, 4);
      this.a.translate(4, n.a.i + 3);
      n.a.setLength(0);
      if (Integer.parseInt(this.a.a(k.a[35])) == 1) {
         n.a.a(n.a.append("Durum: ").append("Çevrimiçi"));
      } else {
         n.a.a(n.a.append("Durum: ").append("Çevrimdýþý"));
      }

      n.a.a(4, 0, this.a);
      this.a.translate(0, n.a.a + 2);
      n.a.a(n.a.append("Sýra: ").append(this.a.a(k.a[144])));
      n.a.a(4, 0, this.a);
      this.a.translate(0, n.a.a + 2);
   }

   private void g() {
      int var1 = Integer.parseInt(this.a.a(k.a[170]));
      n.a.a(this.a, 38, n.a.i, n.a.b - 38, super.d - 16, 4);
      int var2 = Integer.parseInt(this.a.a(k.a[139]));
      n.a.a(var2, this.a, 2, n.a.i + 1, 20);
      n.a.a(this.a, 0, n.a.i, 38, super.d - 16, -1);
      int var4 = n.a.b - 41;
      int var5 = n.a.i + 2;
      int var6 = 1;
      if (var1 != 7) {
         n.a.a(n.a.append(k.a[231]).append(this.a.a(k.a[177])));
      } else if (var1 == 7) {
         var6 = Integer.parseInt(this.a.a(k.a[144]));
         n.a.a(k.a(var6, n.a.append(k.a[182])));
      }

      n.a.a(var4, var4, 2, 1);
      n.a.a(41 + var4 / 2, var5, this.a);
      if (var1 != 7) {
         var5 += n.a.b;
         n.a.a(n.a.append(k.a[238]).append(k.a[231 + var1]));
         n.a.a(var4, var4, 2, 1);
         n.a.a(41 + var4 / 2, var5, this.a);
      } else if (var1 == 7) {
         var5 = var5 + n.a.b + 3;
         this.a(41, var5, (n.a.b - 41) / 2, 5, (int)this.a.a[2] * 100 / var6);
         var5 -= 3;
      }

      var5 += n.a.b;
      if (var1 != 7) {
         n.a.a(n.a.append(k.a[240]).append(this.a.a(k.a[135])).append(k.a[3]).append(this.a.a(k.a[187])));
      } else if (var1 == 7) {
         n.a.a(n.a.append(k.a[239]));
      }

      n.a.a(var4, var4, 2, 1);
      n.a.a(41 + var4 / 2, var5, this.a);
   }

   private void h() {
      n.a.a(this.a, 38, n.a.i, n.a.b - 38, super.d - 16, 4);
      int var1 = Integer.parseInt(this.a.a(k.a[139]));
      n.a.a(var1, this.a, 2, n.a.i + 1, 20);
      n.a.a(this.a, 0, n.a.i, 38, super.d - 16, -1);
      int var3 = n.a.b - 41;
      int var4 = n.a.i + 2;
      n.a.a(n.a.append(k.a[231]).append(this.a.a(k.a[177])));
      n.a.a(var3, var3, 2, 1);
      n.a.a(41 + var3 / 2, var4, this.a);
      var4 += n.a.b;
      n.a.a(n.a.append(n.a.e.a(k.a[178])).append(k.a[8]).append(g.a[61]));
      n.a.a(var3, var3, 2, 1);
      n.a.a(41 + var3 / 2, var4, this.a);
   }

   private void i() {
      Object var1 = null;
      Object var2 = null;
      Object var3 = null;
      Object var4 = null;
      String var10 = this.a.a(k.a[135]);
      String var8 = k.a[240];
      String var9;
      String var11;
      if (n.a.f == 1) {
         var9 = k.a[87];
         var11 = this.a.a(k.a[91]);
      } else {
         var9 = k.a[247];
         var11 = this.a.a(k.a[35]);
      }

      n.a.a(this.a, 0, n.a.i, n.a.b, super.d - 16, 4);
      int var6 = n.a.b - 0;
      int var7 = n.a.i + 2;
      n.a.a(n.a.append(var8).append(var10));
      n.a.a(var6, var6, 2, 1);
      n.a.a(0 + var6 / 2, var7, this.a);
      var7 += n.a.b;
      n.a.a(n.a.append(var9).append(k.a[8]).append(var11));
      n.a.a(var6, var6, 2, 1);
      n.a.a(0 + var6 / 2, var7, this.a);
   }

   private void j() {
      n.a.a(this.a, 0, n.a.i, n.a.b, super.d - 16, 4);
      int var2 = n.a.b - 0;
      int var3 = n.a.i + 2;
      n.a.a(n.a.append(k.a[240]).append(this.a.a(k.a[135])));
      n.a.a(var2, var2, 2, 1);
      n.a.a(0 + var2 / 2, var3, this.a);
      var3 += n.a.b;
      n.a.a(n.a.append(k.a[257]).append(k.a[8]).append(this.a.a(k.a[14])));
      n.a.a(var2, var2, 2, 1);
      n.a.a(0 + var2 / 2, var3, this.a);
   }

   private void k() {
      int var1 = 50 * (int)a.a(a.e(a.b(2L), a.b((long)((int)n.a.b().a(k.a[179]).a(k.a[218]).a[1] - 1)))) - n.a.b();
      n.a.a(this.a, 0, n.a.i, n.a.b, super.d - 16, 4);
      int var3 = n.a.b - 0;
      int var4 = n.a.i + 2;
      n.a.a(n.a.append("Kapasite: ").append(n.a.l).append(" / ").append(var1));
      n.a.a(var3, var3, 2, 1);
      n.a.a(0 + var3 / 2, var4, this.a);
      var4 += n.a.b;
      n.a.a(n.a.append("Ünite Alan: ").append(n.a.a()));
      n.a.a(var3, var3, 2, 1);
      n.a.a(0 + var3 / 2, var4, this.a);
   }

   public final void f(int var1) {
      this.e = var1;
      if (var1 != 1 && var1 != 4 && var1 != 6 && var1 != 8 && var1 != 9) {
         if (var1 == 2 || var1 == 3 || var1 == 5 || var1 == 7 || var1 == 10 || var1 == 11) {
            if (var1 == 2 && n.a.b <= 150) {
               super.d = 33;
            } else {
               super.d = 48;
            }
         }
      } else {
         super.d = 57;
      }

      n.a.i = n.a.c - super.d;
   }

   private void a(int var1, int var2, int var3, int var4, int var5) {
      this.f = 1;
      var5 = var5 < 0 ? 0 : var5;
      n.a.a(k.a((int)this.a.a[2], n.a));
      int var6 = n.a.c;
      int var7;
      if (!this.b) {
         n.a.setLength(0);
         n.a.a(n.a.append((int)this.a.a[0]));
         var7 = n.a.c;
      } else {
         var7 = 0;
      }

      int var8 = var6 + var7 + var3 + 4;
      var8 = (n.a.b - var1 - var8) / 2 + var1;
      if (!this.b) {
         n.a.a(var8, var2 - 3, this.a);
      }

      n.a.a(30, 30, 2, 20);
      n.a.setLength(0);
      n.a.a(k.a((int)this.a.a[2], n.a));
      n.a.a(var8 + var7 + var3 + 4, var2 - 3, this.a);
      this.a.setColor(255, 255, 255);
      this.a.fillRect(var8 + var7 + 2, var2, var3, var4);
      this.a.setColor(0, 232, 0);
      this.a.fillRect(var8 + var7 + 2, var2, var3 * (100 - var5) / 100, var4);
   }

   public final boolean a() {
      n.a.a(this.a);
      return true;
   }
}
