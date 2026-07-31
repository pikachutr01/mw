import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.Image;

public final class o {
   public n a;
   private int d = 0;
   public boolean a = true;
   private static k a = null;
   public int a;
   public int b;
   private String a;
   public int c;
   private static q a;
   public boolean b = false;
   private static n[] a;

   public o(k var1) {
      a = var1;
      if (a == null) {
         a = new n[20];
      }

      this.d = 0;
      if (a == null) {
         a = new q(var1);
      }

   }

   private n a(int var1) {
      Class var2 = null;

      try {
         switch (var1) {
            case 1:
               var2 = Class.forName("i");
               break;
            case 2:
               var2 = Class.forName("f");
               break;
            case 3:
               var2 = Class.forName("p");
               break;
            case 4:
               var2 = Class.forName("m");
               break;
            case 5:
               var2 = Class.forName("l");
         }
      } catch (Exception var6) {
      }

      boolean var3 = false;
      int var5 = -1;

      int var4;
      for(var4 = 0; var4 < a.length; ++var4) {
         if (a[var4] == null) {
            var5 = var4;
            break;
         }

         if (a[var4].getClass() == var2 && !a[var4].a) {
            var3 = true;
            break;
         }
      }

      if (!var3 && var5 >= 0) {
         var4 = var5;
         if (var1 == 3) {
            a[var5] = new p(a);
         } else if (var1 == 1) {
            a[var5] = new i(a);
         } else if (var1 == 2) {
            a[var5] = new f(a);
         } else if (var1 == 5) {
            a[var5] = new l(a);
         } else if (var1 == 4) {
            a[var5] = new m(a);
         }
      }

      a[var4].a = true;
      this.a = a[var4];
      ++this.d;
      this.c = a.k;
      return this.a;
   }

   public final void a(Graphics var1) {
      a.a = this;
      if (this.b == -100) {
         var1.setColor(255, 255, 255);
         var1.fillRect(0, 0, a.b, a.c);

         try {
            Image var2 = Image.createImage("/l.png");
            var1.drawImage(var2, (a.b - var2.getWidth()) / 2, (a.c - var2.getHeight()) / 2, 20);
         } catch (Exception var7) {
         } finally {
            ;
         }

         n.b.a("Sürüm 1.5.2");
         n.b.a(a.b, a.c, 0, 1);
         n.b.a(a.b / 2, a.c - 50, var1);
         n.b.a("www.mobiwar.com");
         n.b.a(a.b, a.c, 0, 1);
         n.b.a(a.b / 2, a.c - 33, var1);
         n.b.a("Copyright 2008");
         n.b.a(a.b, a.c, 0, 1);
         n.b.a(a.b / 2, a.c - 15, var1);
      } else {
         a.a = this.a;
         if (this.a) {
            a.a(var1);
         }

         this.a.a(var1);
         if (a.k > 9) {
            a.a(var1);
         }

         var1.translate(0 - var1.getTranslateX(), 0 - var1.getTranslateY());
         a.k = this.c;
      }
   }

   public final boolean a() {
      try {
         if (this.b == -100) {
            if (a.v > 3) {
               a.a.a.a(8);
            } else {
               ++a.v;
            }
         }

         return this.a != null ? this.a.a() : false;
      } catch (Exception var2) {
         return false;
      }
   }

   public final void a(String var1, int var2) {
      a.k = 7;
      h var3;
      if (var2 != 2 && var2 != 5 && var2 != 7 && var2 != 10 && var2 != 11) {
         if (var1.compareTo(k.a[161]) == 0) {
            var3 = a.g.a(k.a[161]);
         } else {
            var3 = a.b().a(var1);
         }
      } else {
         var3 = a.c.a(var1);
      }

      this.a = true;
      this.a = a.a;
      this.a = 2;
      i var4;
      (var4 = (i)this.a(1)).a(var3, var1);
      var4.f(var2);
      if (var2 == 8) {
         var4.b = "Bu þehirde hiç kahraman yok!";
      } else if (var2 == 10) {
         if (a.f == 2) {
            var4.b = "Bu dünyada hiç kahraman yok!";
         } else if (a.f == 3) {
            var4.b = "Bu dünyada hiç ittifak yok!";
         }
      }

      if (var3 != null) {
         int var9 = 0;

         for(int var10 = 1; var10 < var3.a; ++var10) {
            d var5;
            (var5 = var4.a()).a.setLength(0);
            var5.b = null;
            if (var2 == 2 && var3.a(var10).a(k.a[123]) == null) {
               var5.a = var10 + k.a[7] + k.a[2];
            } else if (var2 != 2 && var2 != 5 && var2 != 11) {
               if (var2 == 7) {
                  String var6;
                  if (var3.a(var10).a(k.a[180]) == null) {
                     var6 = k.a(var3.a(var10).a(k.a[139]), 1);
                  } else {
                     var6 = k.a(var3.a(var10).a(k.a[180]), 2);
                  }

                  var5.a = var10 + k.a[7] + var3.a(var10).a(k.a[123]) + k.a[9] + var6 + k.a[1];
               } else if (var2 == 8) {
                  int var11;
                  if ((var11 = Integer.parseInt(var3.a(var10).a(k.a[178]))) == 0) {
                     var5.a = var3.a(var10).a(k.a[91]).replace('|', ' ');
                  } else {
                     var5.a = var3.a(var10).a(k.a[91]).replace('|', ' ') + ' ' + k.a[0] + '+' + var11 + k.a[1];
                  }
               } else if (var2 == 9) {
                  var5.a = var3.a(var10).a(k.a[91]).replace('|', ' ') + ' ' + k.a[0] + var3.a(var10).a(k.a[177]) + k.a[1];
               } else if (var2 == 10) {
                  if (a.f == 1) {
                     var5.a = var3.a(var10).a(k.a[144]) + '.' + ' ' + var3.a(var10).a(k.a[123]) + "   (" + var3.a(var10).a(k.a[35]) + ')';
                  } else {
                     var5.a = var3.a(var10).a(k.a[144]) + '.' + ' ' + var3.a(var10).a(k.a[14]);
                  }
               } else {
                  var9 = Integer.parseInt(var3.a(var10).a(k.a[162]));
                  String var7 = k.a[202];
                  String var8 = k.a[1];
                  if (var9 >= 40 || var9 == 23 || var9 == 28) {
                     var7 = k.a[203];
                     var8 = k.a[201];
                     if (var3.a(var10).a[0] > 0L) {
                        if (var1.compareTo(k.a[161]) == 0) {
                           String var12;
                           if ((var12 = var3.a(var10).a(k.a[187])) != null && var12.length() > 0 && a.a().compareTo(var12) == 0) {
                              var5.a = 79;
                           }
                        } else {
                           var5.a = 79;
                        }
                     }
                  }

                  if (var3.a(var10).a(k.a[20]) != null && var3.a(var10).a(k.a[20]).compareTo(k.a[186]) != 0) {
                     var5.a = 79;
                     if (var9 != 23 && var9 != 28) {
                        var5.b = var3.a(var10).a(k.a[20]);
                     }
                  }

                  var5.a = k.b(var9) + var7 + var3.a(var10).a[1] + var8;
               }
            } else {
               var5.a = var10 + k.a[7] + var3.a(var10).a(k.a[123]) + k.a[202] + var3.a(var10).a(k.a[144]) + k.a[1];
            }

            if (var2 == 6) {
               if (var9 != 23 && var9 != 28) {
                  var5.a(2, Integer.parseInt(var3.a(var10).a(k.a[162])));
               } else {
                  var5.a(1, Integer.parseInt(var3.a(var10).a(k.a[162])));
               }
            }
         }

      }
   }

   public final void a() {
      this.a = 1;
      a.k = 1;
      this.a = true;
      this.a = a.a;
      f var1;
      (var1 = (f)this.a(2)).b = a.e + 7;
      var1.a = 10;
   }

   public final void b() {
      h var1 = a.c.a(k.a[109]);
      this.a = 2;
      this.a = true;
      a.k = 7;
      this.a = a.a;
      i var2;
      (var2 = (i)this.a(1)).a(var1, k.a[109]);
      var2.b = "Hiç Mesaj Yok";
      var2.f(4);
      if (var1 != null && var1.a != 0) {
         for(int var6 = 1; var6 < var1.a; ++var6) {
            d var3;
            (var3 = var2.a()).b = null;
            int var4;
            if ((var4 = Integer.parseInt(var1.a(var6).a(k.a[162]))) > 0 && var4 < 6) {
               int var5 = Integer.parseInt(var1.a(var6).a(k.a[177]));
               String var8 = k.a(var4);
               if (var5 == 2 && var4 == 1) {
                  var8 = k.a[159];
               } else if (var5 == 2 && var4 == 2) {
                  var8 = k.a[31];
               }

               if (a.b > 150) {
                  var3.a = var8 + k.a[12];
               } else {
                  var3.a = var8;
               }
            } else if (var4 == 6) {
               var3.a = k.a[114] + var1.a(var6).a(k.a[123]) + k.a[1];
            } else if (var4 == 7) {
               var3.a = k.a[89];
            } else if (var4 == 8) {
               var3.a = k.a[88];
            } else if (var4 == 9) {
               var3.a = k.a[276];
            } else if (var4 == 10) {
               var3.a = k.a[294];
            } else if (var4 == 11 || var4 == 12) {
               Integer.parseInt(var1.a(var6).a(k.a[177]));
               String var7 = k.a(var4);
               var3.a = var7 + k.a[268];
            }

            if (Integer.parseInt(var1.a(var6).a(k.a[110])) == 1) {
               var3.a = 84;
            } else {
               var3.a = 83;
            }

            var3.a(4, var4);
         }
      }

   }

   public final void a(h var1, h var2, String var3) {
      this.a = 4;
      a.k = 7;
      this.a = true;
      this.a = a.a;
      i var4;
      (var4 = (i)this.a(1)).a(var1, var3);
      var4.f(3);
      int var6 = 0;
      int var8 = 0;
      String var10;
      if ((var10 = a.b().a(k.a[179]).a(k.a[218]).a(k.a[123])) != null) {
         var8 = Integer.parseInt(var10);
      }

      for(int var11 = 1; var11 < var1.a; ++var11) {
         d var5;
         (var5 = var4.a()).a.setLength(0);
         int var7 = Integer.parseInt(var1.a(var11).a(k.a[162]));
         if (a.y == 12) {
            var6 = Integer.parseInt(var1.a(var11).a(k.a[54]));
            var5.a = k.b(var7) + k.a[202] + var6 + k.a[1];
         } else {
            String var9;
            if ((var9 = var1.a(var11).a(k.a[177])) != null) {
               var6 = Integer.parseInt(var9);
            }

            if (var8 == 12) {
               var6 = 0;
            }

            var5.a = k.b(var7) + k.a[202] + (var1.a(var11).a[1] - (long)var6) + k.a[1];
         }

         var5.a(2, var7);
      }

      for(int var12 = 1; var12 < var2.a; ++var12) {
         int var14 = Integer.parseInt(var2.a(var12).a(k.a[170]));
         if ((a.y != 12 || var14 == 3) && (a.y == 12 || var14 == 2)) {
            d var13;
            (var13 = var4.a()).a.setLength(0);
            var13.a = var2.a(var12).a(k.a[91]).replace('|', ' ');
            var13.a(3, Integer.parseInt(var2.a(var12).a(k.a[162])));
         }
      }

   }

   public final void a(h var1, int var2) {
      this.a = 5;
      if (this.b != -1) {
         this.a = false;
      } else {
         this.a = true;
         a.k = -6;
      }

      p var3;
      (var3 = (p)this.a(3)).a(var1);
      if (a.b > 150) {
         var3.c = 130;
      } else {
         var3.c = 110;
      }

      var3.a = (a.b - var3.c) / 2;
      var3.e = var2;
   }

   public final void a(h var1, int var2, boolean var3) {
      this.a = 6;
      if (this.b < 0) {
         this.a = true;
      } else {
         this.a = false;
      }

      m var4;
      (var4 = (m)this.a(4)).a(var1);
      var4.e = var2;
      var4.b = var3;
      if (var2 == 3) {
         this.a(90, 90, -1, -1);
      }

   }

   public final void b(h var1, int var2) {
      this.a = 7;
      if (this.b == 18) {
         this.a = true;
      } else {
         this.a = false;
      }

      l var3;
      (var3 = (l)this.a(5)).a(var1);
      var3.e = var2;
   }

   public final void c(h var1, int var2) {
      this.a = 9;
      this.a = true;
      m var3;
      (var3 = (m)this.a(4)).a(var1);
      this.a(-2, -2, 0, 0);
      var3.e = var2;
   }

   public final void a(int var1, int var2, int var3, int var4) {
      if (var1 == -2) {
         this.a.c = a.b;
      } else if (var1 == -1) {
         this.a.c = a.b * 4 / 5;
      } else if (var1 == -3) {
         this.a.c = a.b;
      } else {
         this.a.c = var1;
      }

      if (var2 == -2) {
         this.a.d = a.c - a.d;
      } else if (var2 == -1) {
         this.a.d = a.c * 4 / 5;
      } else if (var2 == -3) {
         this.a.d = a.i - a.e;
      } else {
         this.a.d = var2;
      }

      if (var3 == -2) {
         this.a.a = 0;
      } else if (var3 == -1) {
         this.a.a = (a.b - this.a.c) / 2;
      } else if (var3 == -3) {
         this.a.a = 0;
      } else {
         this.a.a = var3;
      }

      if (var4 == -2) {
         this.a.b = 0;
      } else if (var4 == -1) {
         this.a.b = (a.i + a.e - this.a.d) / 2;
      } else if (var4 == -3) {
         this.a.b = a.e;
      } else {
         this.a.b = var4;
      }
   }

   public final void c() {
      if (this.a != null) {
         this.a.a();
      }

      this.a = null;
      this.d = 0;
      this.b = false;
      this.a = false;
   }
}
