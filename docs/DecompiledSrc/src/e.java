import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import javax.microedition.io.Connector;
import javax.microedition.io.SocketConnection;

public final class e implements Runnable {
   public String a;
   private StringBuffer a = new StringBuffer();
   private StringBuffer b = new StringBuffer();
   private k a;
   public h a;
   public o a;
   public int a;
   public int b;
   public String b;
   public boolean a = false;
   private boolean b = true;
   public byte a;
   private int c = 0;
   private String c = null;
   private static OutputStream a = null;
   private static InputStream a = null;
   private static SocketConnection a = null;
   private static int d = 0;
   private boolean c = false;

   public e(k var1) {
      this.a = var1;
   }

   public final void a(StringBuffer var1) {
      var1.insert(0, "cs" + this.a.e + k.a[3]);
      if (this.a.b != null) {
         var1.insert(0, this.a.b);
      } else {
         var1.insert(0, "----");
      }

      this.a = var1.toString();
      this.b = 0;
   }

   public final void run() {
      if (this.a) {
         this.c();
      } else {
         this.a();
      }
   }

   public final void a() {
      try {
         while(!this.a.a) {
            synchronized(this) {
               if (this.a == null) {
                  try {
                     this.wait();
                  } catch (InterruptedException var54) {
                  }

                  if (this.a.a) {
                     return;
                  }
               }

               if (!this.a.a) {
                  try {
                     if (a == null) {
                        if (this.a != 35) {
                           a = (SocketConnection)Connector.open(k.a[81]);
                           this.c = true;
                        } else {
                           a = (SocketConnection)Connector.open(this.a.i);
                           this.c = false;
                        }

                        a = a.openInputStream();
                        a = a.openOutputStream();
                     }

                     a.write(this.a.getBytes(k.a[175]));
                     a.write(10);
                     a.flush();
                     if (d == 10) {
                        a.skip(1L);
                     }

                     while((d = a.read()) != -1 && d != 10) {
                        this.b.append((char)d);
                     }

                     String var2 = new String(this.b.toString().getBytes(k.a[281]), k.a[175]);
                     if (this.a == 3) {
                        try {
                           this.b(var2);
                           this.b = 1;
                        } catch (Exception var53) {
                           this.b = 5;
                        }
                     } else if (this.a == 8) {
                        try {
                           this.c(var2);
                           this.b = 1;
                        } catch (Exception var52) {
                           this.b = 5;
                        }
                     } else if (this.a == 47) {
                        try {
                           this.d(var2);
                           this.b = 1;
                        } catch (Exception var51) {
                           this.b = 5;
                        }
                     } else {
                        this.a(var2);

                        try {
                           this.d();
                           if (this.a == 1) {
                              this.e();
                           }

                           this.b = 1;
                        } catch (Exception var50) {
                           this.b = 5;
                        }
                     }

                     if (this.c) {
                        b();
                     }
                  } catch (IOException var55) {
                     a = null;
                     this.b = 2;
                  } catch (SecurityException var56) {
                     a = null;
                     this.b = 3;
                  } catch (Exception var57) {
                     a = null;
                     this.b = 6;
                  } finally {
                     try {
                        this.b.setLength(0);
                        if (this.b != 1) {
                           this.a = 0;
                        }

                        this.b = true;
                        this.a = null;
                        if (this.a != null) {
                           this.a.a();
                        }

                        this.a = null;
                        System.gc();
                     } catch (Exception var49) {
                     }

                  }
               }
            }

            if (this.a) {
               return;
            }
         }

         return;
      } catch (Exception var60) {
      } finally {
         try {
            if (!this.a) {
               b();
            }
         } catch (Exception var48) {
         }

      }

   }

   private void c() {
      long var1 = 0L;
      long var3 = 0L;

      while(!this.a.a) {
         try {
            var1 = System.currentTimeMillis();
            if (this.a.u != -1) {
               ++this.a.u;
               if (this.a.u % 10 == 0) {
                  this.a.c();
               }

               if (this.a.u % 30 == 0) {
                  System.gc();
               }
            }

            if (!this.a.a) {
               try {
                  if (this.a != null) {
                     this.a.a();
                     this.a.a.repaint();
                     this.a.a.serviceRepaints();
                  }
               } catch (Exception var6) {
               }
            }

            if ((var3 = System.currentTimeMillis() - var1) < 1000L) {
               Thread.sleep(1000L - var3);
            }
         } catch (Exception var7) {
         }
      }

   }

   private void a(String var1) {
      this.a = k.a();
      String var3 = k.a[222];
      Object var4 = null;
      boolean var5 = false;
      int var6 = 0;
      h var7 = null;
      boolean var8 = false;
      int var9 = var1.length();

      for(int var10 = 0; var10 < var9; ++var10) {
         if (var1.charAt(var10) != '<') {
            if (var3.length() != 0 && var1.charAt(var10) != '\n') {
               for(int var13 = var10; var10 < var9; ++var10) {
                  if (var1.charAt(var10) == '<') {
                     String var11 = var1.substring(var13, var10);
                     if (!var8) {
                        this.a.a(var6, var11);
                     }

                     var3 = k.a[222];
                     --var10;
                     break;
                  }
               }
            }
         } else {
            var8 = false;

            for(int var12 = var10 + 1; var10 < var9; ++var10) {
               if (var1.charAt(var10) == '>' || var1.charAt(var10) == ' ' || var1.charAt(var10) == '=' || var1.charAt(var10) == '/') {
                  if (var1.charAt(var10) == ' ') {
                     if (var8) {
                        var3 = var1.substring(var12 + 1, var10);
                        var7.a(var7.a - 1, var3);
                     } else {
                        var3 = var1.substring(var12, var10);
                        var6 = this.a.a((String)var3, (Object)null);
                     }
                  } else if (var1.charAt(var10) == '=') {
                     if (!var8) {
                        var7 = k.a();
                        var8 = true;
                     }

                     var3 = var1.substring(var12 + 1, var10);
                     var7.a((String)var3, (Object)null);
                  } else {
                     if (var1.charAt(var10) == '>') {
                        if (!var8) {
                           var3 = var1.substring(var12, var10);
                           var6 = this.a.a((String)var3, (Object)null);
                        } else {
                           if (var12 + 1 != var10) {
                              var3 = var1.substring(var12 + 1, var10);
                              var7.a(var7.a - 1, var3);
                           }

                           this.a.a(var7, var6);
                        }
                        break;
                     }

                     if (var1.charAt(var10) == '/' && var8) {
                        var3 = var1.substring(var12 + 1, var10);
                        var7.a(var7.a - 1, var3);
                     }
                  }

                  var12 = var10;
               }
            }
         }
      }

      if (var3.length() != 0) {
         this.a.a((String)var3, (Object)null);
      }

   }

   private void d() {
      Object var1 = null;
      int var4 = 0;
      if (!this.a) {
         this.a.b();
      }

      h var2 = this.a.a(0);

      for(int var7 = 0; var7 < var2.a; ++var7) {
         if (var2.b(var7).compareTo(k.a[144]) == 0) {
            this.a = Integer.parseInt(var2.a(var7));
            if (this.a != 1) {
               int var3 = this.a(1, k.a[29], k.a[14]);
               this.b = this.a.a(var3);
            }
         } else if (var2.b(var7).compareTo(k.a[14]) == 0) {
            this.a.l = Integer.parseInt(var2.a(var7));
            this.a.b().a(0).a[0] = a.a(var2.a(var7));
         } else if (var2.b(var7).compareTo(k.a[180]) == 0) {
            this.a.m = Integer.parseInt(var2.a(var7));
            this.a.b().a(0).a[1] = a.a(var2.a(var7));
         } else if (var2.b(var7).compareTo(k.a[110]) == 0) {
            this.a.n = Integer.parseInt(var2.a(var7));
         } else if (var2.b(var7).compareTo(k.a[102]) == 0) {
            this.a.b = var2.a(var7);
         } else if (var2.b(var7).compareTo(k.a[52]) == 0) {
            this.a.q = Integer.parseInt(var2.a(var7));
         } else if (var2.b(var7).compareTo(k.a[185]) == 0) {
            this.a.r = Integer.parseInt(var2.a(var7));
         } else if (var2.b(var7).compareTo(k.a[178]) == 0) {
            this.a.s = Integer.parseInt(var2.a(var7));
         } else if (var2.b(var7).compareTo(k.a[127]) == 0) {
            this.a.g = a.a(var2.a(var7));
         } else if (var2.b(var7).compareTo(k.a[126]) == 0) {
            this.a.h = a.a(var2.a(var7));
         } else if (var2.b(var7).compareTo(k.a[29]) == 0) {
            this.a.x = Integer.parseInt(var2.a(var7));
         } else if (var2.b(var7).compareTo(k.a[35]) == 0) {
            this.a.w = Integer.parseInt(var2.a(var7));
         } else if (var2.b(var7).compareTo(k.a[177]) == 0) {
            this.a.g = var2.a(var7).replace('|', ' ');
         } else if (var2.b(var7).compareTo(k.a[278]) == 0) {
            this.a.z = Integer.parseInt(var2.a(var7));
         } else if (var2.b(var7).compareTo(k.a[280]) == 0) {
            this.a.A = Integer.parseInt(var2.a(var7));
         } else if (var2.b(var7).compareTo(k.a[292]) != 0 && var2.b(var7).compareTo(k.a[293]) == 0 && this.a.h == null) {
            this.a.h = var2.a(var7);
         }
      }

      int var12;
      for(int var17 = var12 = this.a(1, k.a[172], k.a[170]); var12 != -1; var17 = var12 = this.a(var17 + 1, k.a[172], k.a[170])) {
         var2 = this.a.a(var12);
         int var5 = this.a.a(var2.a(k.a[135]), var2.a(k.a[14]));
         if (var2.a(k.a[119]) != null) {
            this.a.a(var5, a.a(var2.a(k.a[119])), a.a(var2.a(k.a[180])));
         }

         var4 = var12;

         for(int var13 = this.a(var12, k.a[170], k.a[185]); var13 != -1; var13 = this.a(var13 + 1, k.a[170], k.a[185])) {
            h var8;
            if (Integer.parseInt((var8 = this.a.a(var13)).a(k.a[14])) == 3) {
               this.a.a(var5, Integer.parseInt(var8.a(k.a[119])), var8.a(k.a[74]));
            } else {
               this.a.a(var5, Integer.parseInt(var8.a(k.a[119])), Integer.parseInt(var8.a(k.a[54])), var8.a(k.a[74]), var8.a(k.a[75]), Integer.parseInt(var8.a(k.a[104])), Integer.parseInt(var8.a(k.a[162])), Integer.parseInt(var8.a(k.a[14])), 0);
            }

            var4 = var13;
         }

         for(int var14 = this.a(var4 + 1, k.a[170], k.a[123]); var14 != -1; var14 = this.a(var14 + 1, k.a[170], k.a[123])) {
            h var9 = this.a.a(var14);
            this.a.a(var5, Integer.parseInt(var9.a(k.a[119])), Integer.parseInt(var9.a(k.a[54])), var9.a(k.a[74]), var9.a(k.a[75]), Integer.parseInt(var9.a(k.a[104])), Integer.parseInt(var9.a(k.a[162])), Integer.parseInt(var9.a(k.a[14])), 1);
         }
      }

      if (this.a == 35) {
         for(int var15 = this.a(1, k.a[29], k.a[20]); var15 != -1; var15 = this.a(var15 + 1, k.a[29], k.a[20])) {
            h var10 = this.a.a(var15);
            this.a.a[this.a.a] = Byte.parseByte(var10.a(k.a[162]));
            this.a.b[this.a.a] = Byte.parseByte(var10.a(k.a[20]));
            this.a.a[this.a.a] = Integer.parseInt(var10.a(k.a[108]));
            this.a.b[this.a.a] = Integer.parseInt(var10.a(k.a[110]));
            if (var10.a(k.a[119]) != null) {
               this.a.c[this.a.a] = Integer.parseInt(var10.a(k.a[119]));
            }

            ++this.a.a;
         }
      }

   }

   private int a(int var1, String var2, String var3) {
      int var4 = this.a.a;
      this.a.setLength(0);
      this.a.append(k.a[3]);

      for(int var5 = var1; var5 < var4; ++var5) {
         if (this.a.b(var5).compareTo(var3) == 0) {
            return var5;
         }

         if (this.a.b(var5).compareTo(k.a[3] + var2) == 0) {
            return -1;
         }
      }

      return -1;
   }

   private void e() {
      h var2 = null;
      if (this.a != 2 && this.a != 12 && this.a != 10 && this.a != 11) {
         if (this.a == 27) {
            for(int var43 = this.a(1, k.a[29], k.a[170]); var43 != -1; var43 = this.a(var43 + 1, k.a[29], k.a[170])) {
               h var53 = this.a.a.a(this.a.a(var43).a(k.a[135]));
               var43 = this.a(var43 + 1, k.a[170], k.a[144]);

               for(this.b = true; var43 != -1; var43 = this.a(var43 + 1, k.a[170], k.a[144])) {
                  h var17 = this.a.a(var43);
                  if ((var2 = this.a(var17, var53, k.a[179], (String)null, 0)).a(k.a[180]) == null) {
                     var2.a[0] = 0L;
                  } else {
                     var2.a[0] = (long)Integer.parseInt(var2.a(k.a[180]));
                  }

                  if (var2.a(k.a[104]) == null) {
                     var2.a[2] = 0L;
                  } else {
                     var2.a[2] = (long)Integer.parseInt(var2.a(k.a[104]));
                  }

                  if (var2.a(k.a[14]) == null) {
                     var2.a[1] = 0L;
                  } else {
                     var2.a[1] = (long)Integer.parseInt(var2.a(k.a[14]));
                  }
               }
            }
         } else if (this.a == 28) {
            int var41 = this.a(1, k.a[29], k.a[170]);
            int var52 = this.a.a.a(this.a.a(var41).a(k.a[135]));
            this.a.a(var52, a.a(this.a.a(var41).a(k.a[119])), a.a(this.a.a(var41).a(k.a[180])));
            if ((var41 = this.a(var41 + 1, k.a[170], k.a[110])) != -1) {
               h var57 = this.a.a.a(var52).a(k.a[179]).a(k.a[218]);
               h var16 = this.a.a(var41);
               var57.a[2] = (long)Integer.parseInt(var16.a(k.a[104]));
               var57.a((Object)var16.a(k.a[123]), (String)k.a[123]);
               var57.a((Object)var16.a(k.a[104]), (String)k.a[104]);
               var57.a((Object)var16.a(k.a[52]), (String)k.a[52]);
               return;
            }
         } else {
            if (this.a == 7 || this.a == 16 || this.a == 4 || this.a == 5 || this.a == 1 || this.a == 9) {
               h var51 = k.a();
               Object var55 = null;
               h var59 = null;
               Object var62 = null;
               int var8 = 0;

               for(int var36 = this.a(1, k.a[29], k.a[14]); var36 != -1; var36 = this.a(var36 + 1, k.a[29], k.a[14])) {
                  var51.a(k.a[14], this.a.a(var36).a(k.a[91]));
               }

               if (var51.a > 0) {
                  var51.a((String)k.a[187], (Object)k.a[222]);
               }

               for(int var37 = this.a(1, k.a[29], k.a[178]); var37 != -1; var37 = this.a(var37, k.a[29], k.a[178])) {
                  h var56 = this.a.a(var37);
                  var51.a(k.a[14], var56.a(k.a[14]));
                  var59 = var51.a(var51.a((String)k.a[108], (Object)(new h(1))));
                  if (var56.a(k.a[20]) != null) {
                     var59.a(k.a[20], var56.a(k.a[20]));
                     var59 = var59.a(var59.a((String)k.a[108], (Object)(new h(4))));
                  }

                  if (var37 + 1 == this.a(var37, k.a[29], k.a[108])) {
                     int var38;
                     var8 = var38 = this.a(var37, k.a[108], k.a[177]);

                     while(var38 != -1) {
                        var59.a((String)k.a[91], (Object)this.a.a(var38).a(k.a[91]));
                        if ((var38 = this.a(var38 + 1, k.a[108], k.a[177])) != -1) {
                           var8 = var38;
                        }
                     }

                     var37 = var8;
                  } else {
                     ++var37;
                  }

                  var51.a((String)k.a[187], (Object)k.a[222]);
               }

               for(int var40 = this.a(1, k.a[29], k.a[20]); var40 != -1; var40 = this.a(var40 + 1, k.a[29], k.a[20])) {
                  var51.a(k.a[20], this.a.a(var40).a(k.a[91]));
               }

               this.a.d = var51;
               return;
            }

            if (this.a == 29) {
               if (this.a(1, k.a[29], k.a[54]) != -1) {
                  this.a.g = 1;
               } else {
                  this.a.g = 0;
               }

               for(int var20 = this.a(1, k.a[29], k.a[144]); var20 != -1; var20 = this.a(var20 + 1, k.a[29], k.a[144])) {
                  h var9 = this.a.a(var20);
                  this.a(var9, this.a.c, k.a[13], k.a[144], 1);
               }
            } else if (this.a == 6) {
               int var21 = this.a(1, k.a[29], k.a[54]);
               this.a(this.a.a(var21), this.a.c, k.a[285], k.a[54], 1);
               var21 = this.a(1, k.a[29], k.a[144]);

               for(this.b = true; var21 != -1; var21 = this.a(var21 + 1, k.a[29], k.a[144])) {
                  h var10 = (h)this.a.a(var21);
                  this.a(var10, this.a.c, k.a[176], k.a[144], 1);
               }
            } else {
               if (this.a == 30) {
                  int var35 = this.a(1, k.a[29], k.a[14]);
                  this.b = this.a.a(var35);
                  return;
               }

               if (this.a != 26) {
                  if (this.a == 14) {
                     return;
                  }

                  if (this.a == 31) {
                     int var34 = this.a(1, k.a[29], k.a[144]);
                     h var15 = this.a.a(var34);
                     this.a.d = k.a();
                     this.a.d.a(k.a[104], var15.a(k.a[104]));
                     this.a.d.a(k.a[144], var15.a(k.a[144]));
                     return;
                  }

                  if (this.a == 32) {
                     int var23;
                     if ((var23 = this.a(1, k.a[29], k.a[123])) != -1) {
                        h var4 = this.a.a(var23);
                        this.a.a(this.a.j, Integer.parseInt(var4.a(k.a[119])), Integer.parseInt(var4.a(k.a[54])), var4.a(k.a[74]), var4.a(k.a[75]), Integer.parseInt(var4.a(k.a[104])), Integer.parseInt(var4.a(k.a[162])), Integer.parseInt(var4.a(k.a[14])), 1);
                        int var5;
                        if ((var5 = this.a.a.a(var4.a(k.a[74]))) != -1) {
                           this.a.a(var5, Integer.parseInt(var4.a(k.a[119])), this.a.a());
                           return;
                        }
                     }
                  } else {
                     if (this.a == 13) {
                        h var50;
                        (var50 = this.a.b().a(k.a[179]).a(k.a[218])).a((Object)k.a[186], (String)k.a[104]);
                        var50.a((Object)k.a[186], (String)k.a[123]);
                        return;
                     }

                     if (this.a == 20) {
                        this.a.c.a(k.a[176]).a((Object)this.a.b);
                        return;
                     }

                     if (this.a == 33) {
                        Object var45 = null;
                        h var54 = null;
                        int var24 = this.a(1, k.a[29], k.a[123]);
                        boolean var6 = false;
                        if (var24 != -1) {
                           h var46;
                           var54 = var46 = this.a.a(var24);
                           this.a.a(this.a.j, Integer.parseInt(var46.a(k.a[119])), Integer.parseInt(var46.a(k.a[54])), var46.a(k.a[74]), var46.a(k.a[75]), Integer.parseInt(var46.a(k.a[104])), Integer.parseInt(var46.a(k.a[162])), Integer.parseInt(var46.a(k.a[14])), 1);
                        }

                        if ((var24 = this.a(1, k.a[29], k.a[54])) != -1) {
                           h var47 = this.a.a(var24);

                           for(int var7 = 0; var7 < this.a.a.a; ++var7) {
                              if (this.a.a.a(var7).a(0).a(k.a[135]).compareTo(var54.a(k.a[74])) == 0) {
                                 this.a.a(var7, Integer.parseInt(var47.a(k.a[119])), Integer.parseInt(var47.a(k.a[54])), var47.a(k.a[74]), var47.a(k.a[75]), Integer.parseInt(var47.a(k.a[104])), Integer.parseInt(var47.a(k.a[162])), Integer.parseInt(var47.a(k.a[14])), 0);
                              }
                           }
                        }

                        if (var54 == null) {
                           if ((var24 = this.a(1, k.a[29], k.a[180])) != -1) {
                              h var61;
                              (var61 = this.a.b().a(k.a[179]).a(k.a[218])).a(this.a.a(var24).a(k.a[52]), k.a[52]);
                              var61.a(this.a.a(var24).a(k.a[104]), k.a[104]);
                              var61.a(this.a.a(var24).a(k.a[49]), k.a[49]);
                              var61.a(this.a.a(var24).a(k.a[123]), k.a[123]);
                              var61.a[2] = (long)Integer.parseInt(var61.a(k.a[104]));
                           }

                           for(int var27 = this.a(1, k.a[29], k.a[144]); var27 != -1; var27 = this.a(var27 + 1, k.a[29], k.a[144])) {
                              this.a.b().a(k.a[19]).a(k.a[143] + this.a.a(var27).a(k.a[162])).a(this.a.a(var27).a(k.a[177]), k.a[177]);
                           }
                        }
                     } else {
                        if (this.a == 18) {
                           ((h)this.a.c.a(k.a[109])).a((Object)this.a.b);
                           return;
                        }

                        if (this.a == 34) {
                           int var28;
                           if ((var28 = this.a(1, k.a[29], k.a[144])) != -1) {
                              this.a.f = this.a.a(var28).a(k.a[14]);
                              return;
                           }
                        } else if (this.a == 42 || this.a == 43 || this.a == 46) {
                           int var33;
                           if ((var33 = this.a(1, k.a[29], k.a[144])) == -1) {
                              this.a((h)null, this.a.b(), k.a[103], (String)null, 1);
                           }

                           for(; var33 != -1; var33 = this.a(var33 + 1, k.a[29], k.a[144])) {
                              h var14 = this.a.a(var33);
                              (var2 = this.a(var14, this.a.b(), k.a[103], (String)null, 0)).a[0] = (long)Integer.parseInt(var2.a(k.a[170]));
                              if (var2.a[0] == 7L) {
                                 var2.a[1] = var2.a[0];
                                 var2.a[2] = (long)Integer.parseInt(var2.a(k.a[104]));
                                 var2.a[0] = 1L;
                              } else {
                                 var2.a[0] = 0L;
                              }
                           }
                        } else if (this.a == 44 || this.a == 45) {
                           for(int var32 = this.a(1, k.a[29], k.a[144]); var32 != -1; var32 = this.a(var32 + 1, k.a[29], k.a[144])) {
                              h var13 = this.a.a(var32);
                              this.a(var13, this.a.b(), k.a[243], (String)null, 0);
                           }
                        } else {
                           if (this.a == 53) {
                              int var30 = this.a(1, k.a[29], k.a[104]);
                              h var11 = this.a.a(var30);
                              h var48;
                              (var48 = this.a.b().a(k.a[179]).a(k.a[274])).a[2] = (long)Integer.parseInt(var11.a(k.a[104]));
                              var48.a((Object)String.valueOf(15), (String)k.a[123]);
                              var48.a((Object)var11.a(k.a[52]), (String)k.a[52]);
                              var30 = this.a(1, k.a[29], k.a[74]);
                              var11 = this.a.a(var30);
                              (var48 = this.a.f.a(k.a[179]).a(k.a[274])).a[2] = (long)Integer.parseInt(var11.a(k.a[104]));
                              var48.a((Object)String.valueOf(15), (String)k.a[123]);
                              var48.a((Object)var11.a(k.a[52]), (String)k.a[52]);
                              return;
                           }

                           if (this.a == 55 || this.a == 56 || this.a == 59 || this.a == 60 || this.a == 61) {
                              int var29 = this.a(1, k.a[29], k.a[14]);
                              this.b = this.a.a(var29);
                           }
                        }
                     }
                  }
               }
            }
         }
      } else {
         for(int var3 = this.a(1, k.a[29], k.a[144]); var3 != -1; var3 = this.a(var3 + 1, k.a[29], k.a[144])) {
            h var1 = this.a.a(var3);
            if (this.a == 2) {
               var2 = this.a(var1, this.a.b(), k.a[19], (String)null, 0);
            } else if (this.a == 12) {
               var2 = this.a(var1, this.a.b(), k.a[179], (String)null, 0);
            } else if (this.a == 10) {
               var2 = this.a(var1, this.a.b(), k.a[143], (String)null, 0);
            } else if (this.a == 11) {
               var2 = this.a(var1, this.a.g, k.a[161], (String)null, 0);
            }

            if (var2.a(k.a[180]) == null) {
               var2.a[0] = 0L;
            } else {
               var2.a[0] = (long)Integer.parseInt(var2.a(k.a[180]));
            }

            if (var2.a(k.a[104]) == null) {
               var2.a[2] = 0L;
            } else {
               var2.a[2] = (long)Integer.parseInt(var2.a(k.a[104]));
            }

            if (var2.a(k.a[14]) == null) {
               var2.a[1] = 0L;
            } else {
               var2.a[1] = (long)Integer.parseInt(var2.a(k.a[14]));
            }
         }
      }

   }

   private h a(h var1, h var2, String var3, String var4, int var5) {
      h var6;
      if (var3 == null) {
         var6 = var2;
         var2.a[0] = (long)this.a.u;
      } else {
         if (this.b) {
            if (var2.a(var3) != -1) {
               var2.a(var3).a();
            }

            (var6 = k.a()).a((String)k.a[222], (Object)null);
            var6.a[0] = (long)this.a.u;
            var2.a((Object)var6, (String)var3);
         } else {
            var6 = var2.a(var3);
         }

         this.b = false;
      }

      h var7 = k.a();
      if (var1 != null) {
         for(int var8 = 0; var8 < var1.a; ++var8) {
            var7.a(var1.b(var8), var1.a(var8));
         }
      }

      if (var5 == 0) {
         var6.a((Object)var7, (String)(k.a[143] + var1.a(k.a[162])));
      } else if (var1 != null) {
         var6.a((String)var4, (Object)var7);
      }

      return var7;
   }

   private void b(String var1) {
      this.c = var1;
      this.c = 0;
      int var2 = 0;
      String var4 = this.a();
      this.a = Integer.parseInt(var4);
      if (this.a == 1) {
         String var5 = this.a();
         h var6;
         (var6 = new h(5)).a((String)k.a[170], (Object)var5);
         this.a(var6, this.a.c, k.a[53], k.a[54], 1);

         int var3;
         for(this.b = true; (var3 = this.a()) != -1; this.a(var6, this.a.c, k.a[34], k.a[144], 1)) {
            ++var2;
            (var6 = new h(5)).a((String)k.a[135], (Object)(var5 + k.a[4] + var2));
            if (var3 > 0 && (var4 = this.a()) != null) {
               var6.a((String)k.a[123], (Object)var4);
               var4 = this.a();
               var6.a((String)k.a[49], (Object)var4);
               var4 = this.a();
               var6.a((String)k.a[91], (Object)var4);
               var4 = this.a();
               var6.a((String)k.a[144], (Object)var4);
               var4 = this.a();
               var6.a((String)k.a[20], (Object)var4);
            }
         }

         this.c = null;
      }
   }

   private void c(String var1) {
      this.c = var1;
      this.c = 0;
      String var5 = this.a();
      this.a = Integer.parseInt(var5);
      if (this.a == 1) {
         h var6 = new h(5);
         var5 = this.a();
         var6.a((String)k.a[144], (Object)var5);
         var5 = this.a();
         var6.a((String)k.a[14], (Object)var5);
         this.a(var6, this.a.c, k.a[116], k.a[54], 1);
         this.b = true;
         this.a.c.a(this.a.c.a(k.a[109]));

         int var3;
         for(; (var3 = this.a()) != -1; this.a(var6, this.a.c, k.a[109], k.a[144], 1)) {
            (var6 = new h(5)).a((String)k.a[144], (Object)k.a[222]);
            if (var3 > 0 && (var5 = this.a()) != null) {
               var6.a((String)k.a[119], (Object)var5);
               var5 = this.a();
               var6.a((String)k.a[162], (Object)var5);
               int var4 = Integer.parseInt(var5);
               var5 = this.a();
               var6.a((String)k.a[185], (Object)var5);
               if (var4 > 5 && var4 < 11) {
                  var5 = this.a();
                  var6.a((String)k.a[123], (Object)var5);
                  var5 = this.a();
                  var6.a((String)k.a[110], (Object)var5);
               } else if (var4 < 6 || var4 > 10 && var4 < 13) {
                  var5 = this.a();
                  var6.a((String)k.a[54], (Object)var5);
                  var5 = this.a();
                  var6.a((String)k.a[123], (Object)var5);
                  var5 = this.a();
                  var6.a((String)k.a[74], (Object)var5);
                  var5 = this.a();
                  var6.a((String)k.a[104], (Object)var5);
                  var5 = this.a();
                  var6.a((String)k.a[177], (Object)var5);
                  var5 = this.a();
                  var6.a((String)k.a[110], (Object)var5);
               }
            }
         }

         this.c = null;
      }
   }

   private void d(String var1) {
      this.c = var1;
      this.c = 0;
      String var4 = this.a();
      this.a = Integer.parseInt(var4);
      if (this.a == 1) {
         h var5 = new h(5);
         var4 = this.a();
         var5.a((String)k.a[144], (Object)var4);
         var4 = this.a();
         var5.a((String)k.a[14], (Object)var4);
         this.a(var5, this.a.c, k.a[253], k.a[54], 1);
         this.b = true;
         this.a.c.a(this.a.c.a(k.a[249]));

         int var3;
         for(; (var3 = this.a()) != -1; this.a(var5, this.a.c, k.a[249], k.a[144], 1)) {
            var5 = new h(5);
            if (var3 > 0 && (var4 = this.a()) != null) {
               var5.a((String)k.a[144], (Object)var4);
               var4 = this.a();
               if (this.a.f == 1) {
                  var5.a((String)k.a[123], (Object)var4);
               } else {
                  var5.a((String)k.a[14], (Object)var4);
               }

               var4 = this.a();
               var5.a((String)k.a[135], (Object)var4);
               var4 = this.a();
               var5.a((String)k.a[35], (Object)var4);
               var4 = this.a();
               var5.a((String)k.a[91], (Object)var4);
            }
         }

         this.c = null;
      }
   }

   private int a() {
      for(int var1 = this.c; var1 < this.c.length(); ++var1) {
         if (this.c.charAt(var1) == '$') {
            this.c = var1 + 1;
            if (this.c >= this.c.length()) {
               return -1;
            }

            if (this.c.charAt(this.c) == '$') {
               return -2;
            }

            return var1;
         }
      }

      return -1;
   }

   private String a() {
      int var1 = 0;

      for(var1 = this.c; var1 < this.c.length(); ++var1) {
         if (this.c.charAt(var1) == '~' || this.c.charAt(var1) == '$') {
            String var2 = this.c.substring(this.c, var1);
            if (this.c.charAt(var1) == '~') {
               this.c = var1 + 1;
            }

            return var2;
         }
      }

      if (this.c < var1) {
         return this.c.substring(this.c, var1);
      } else {
         return null;
      }
   }

   public static void b() throws Exception {
      if (a != null) {
         a.close();
      }

      if (a != null) {
         a.close();
      }

      if (a != null) {
         a.close();
      }

      a = null;
      a = null;
      a = null;
      d = 0;
   }
}
