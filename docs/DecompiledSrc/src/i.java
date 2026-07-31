import javax.microedition.lcdui.Graphics;

public final class i extends n {
   public d[] a;
   private static j a;
   private int e = 0;
   private int f = 0;
   private int g = 1;
   private int h;
   public String a;
   private int i = 1;
   private h a;
   private StringBuffer c;
   private StringBuffer d;
   private StringBuffer e;
   public StringBuffer b;
   public String b;
   public boolean b = false;
   public boolean c = false;
   private static int j = 0;

   public i(k var1) {
      super(var1);
      if (a == null) {
         a = new j(n.a);
      }

      this.b = new StringBuffer();
      this.e = new StringBuffer();
      this.c = new StringBuffer();
      this.d = new StringBuffer();
      this.a = new d[20];

      for(int var2 = 0; var2 < this.a.length; ++var2) {
         this.a[var2] = new d(n.a, n.a, n.b);
      }

      this.e = 0;
   }

   public final void a(h var1, String var2) {
      n.a.l = 0L;
      this.h = 0;
      this.a = var1;
      this.a = var2;
      this.e = 0;
      this.b = false;
      this.b.setLength(0);
      this.e.setLength(0);
      if (var1 == null) {
         a.a((h)null, var2);
      } else {
         if (this.a.a > 0) {
            a.a(var1.a(1), var2);
            n.a.b = this.a.a(1);
            if (this.a.startsWith(k.a[34]) || this.a.startsWith(k.a[13])) {
               n.a.f = n.a.b;
            }
         }

      }
   }

   public final d a() {
      if (this.e == this.a.length) {
         d[] var1 = new d[this.e + 5];

         for(int var2 = 0; var2 < 5; ++var2) {
            var1[this.e + 1] = new d(n.a, n.a, n.b);
         }

         System.arraycopy(this.a, 0, var1, 0, this.e);
         this.a = var1;
      }

      ++this.e;
      this.a[this.e - 1].a = 0;
      this.a[this.e - 1].a = false;
      this.a[this.e - 1].a(1, 0);
      this.a[this.e - 1].a.setLength(0);
      return this.a[this.e - 1];
   }

   private void b(Graphics var1) {
      var1.translate(0, n.a.e + 3);
      byte var3 = 22;
      byte var4 = 0;
      int var7 = 0;
      Object var8 = null;
      int var6;
      if (this.g != 4 && this.g != 10 && this.g != 7) {
         n.a.a(k.a[106]);
         var6 = n.a.c;
         n.a.a(k.a[41]);
         var7 = n.a.c;
      } else {
         h var9;
         if (this.g == 4) {
            var9 = n.a.c.a(k.a[116]).a(k.a[54]);
         } else if (this.g == 7) {
            var9 = n.a.c.a(k.a[285]).a(k.a[54]);
         } else {
            var9 = n.a.c.a(k.a[253]).a(k.a[54]);
         }

         String var12 = var9.a(k.a[14]);
         n.a.a(k.a[147]);
         var6 = n.a.c;
         n.a.a(n.a.append(k.a[3]).append(var12));
         var7 = n.a.c;
         var3 = 0;
      }

      int var5 = 22 + var3 + var6 + var7 + 6;
      int var13 = (n.a.b - var5) / 2;
      if (this.g != 4 && this.g != 10 && this.g != 7) {
         n.a.a(k.a[106]);
      } else {
         n.a.a(k.a[147]);
      }

      n.a.a(var13, 5, var1);
      if (this.b) {
         if (this.f == -1) {
            if (this.i == 0) {
               n.a.k = 11;
               n.a.a(111, var1, var13 - 17, 1, 20);
            } else {
               n.a.k = 14;
               n.a.a(113, var1, var13 - 17, 1, 20);
            }
         }
      } else if (this.f == -1) {
         if (this.i == 0) {
            n.a.k = 13;
            n.a.a(23, var1, var13 - 17, 1, 20);
         } else {
            n.a.k = 14;
            n.a.a(102, var1, var13 - 17, 1, 20);
         }
      }

      var13 = var13 + var6 + 1;
      if (this.i == 1 && this.f == -1) {
         var4 = 2;
      }

      this.a(var1, var13, 2, 22, var4);
      n.b.a(this.b, false);
      n.b.a(22, 22, 2, 1);
      n.b.a(var13 + 11, 3, var1);
      if (this.g != 4 && this.g != 10 && this.g != 7) {
         var13 = var13 + 22 + 5;
         n.a.a(k.a[41]);
         n.a.a(var13, 5, var1);
         if (this.i == 2 && this.f == -1) {
            var4 = 2;
         } else {
            var4 = 0;
         }

         var13 = var13 + var7 + 1;
         this.a(var1, var13, 2, var3, var4);
         n.b.a(this.e, false);
         n.b.a(var3, var3, 2, 1);
         n.b.a(var13 + var3 / 2, 3, var1);
      } else {
         n.a.a(n.a);
         n.a.a(var13 + 22 + 3, 4, var1);
         var13 = var13 + 22 + var7 + 3;
      }

      if (this.b) {
         if (this.f == -1) {
            if (this.i == 3) {
               n.a.k = 10;
               n.a.a(110, var1, var13 + var3 + 2, 1, 20);
            } else {
               n.a.a(112, var1, var13 + var3 + 2, 1, 20);
            }
         }
      } else if (this.f == -1) {
         if (this.i == 3) {
            n.a.k = 12;
            n.a.a(24, var1, var13 + var3 + 2, 1, 20);
         } else {
            n.a.a(103, var1, var13 + var3 + 2, 1, 20);
         }
      }

      var1.translate(0, n.a.b + 6);
   }

   private void a(Graphics var1, int var2, int var3, int var4, int var5) {
      var1.setColor(255, 255, 255);
      var1.fillRect(var2, var3 + 1, var4, n.a.a + 2);
      var1.setColor(100, 100, 100);
      var1.drawRect(var2 - 1, var3, var4 + 1, n.a.a + 3);
      var1.setColor(235, 10, 10);
      if (var5 != 0) {
         n.a(var1, var2 - 2, var3, var4 + 2, n.a.a + 2, var5);
      }

   }

   public final void f(int var1) {
      this.g = var1;
      if (var1 == 2) {
         String var2 = n.a.c.a(k.a[53]).a(k.a[54]).a(k.a[170]);
         this.b.append(var2.substring(0, var2.indexOf(k.a[4])));
         this.e.append(var2.substring(var2.indexOf(k.a[4]) + 1));
      } else if (var1 == 4) {
         this.b.append(n.a.c.a(k.a[116]).a(k.a[54]).a(k.a[144]));
      } else if (var1 == 10) {
         this.b.append(n.a.c.a(k.a[253]).a(k.a[54]).a(k.a[144]));
      } else if (var1 == 7) {
         this.b.append(n.a.c.a(k.a[285]).a(k.a[54]).a(k.a[144]));
      }

      if (this.a.startsWith(k.a[34]) || this.a.startsWith(k.a[13])) {
         n.a.f = n.a.b;
      }

      if (this.g == 3) {
         n.a.p = 0;
      }

      if (this.g == 2) {
         this.h = 3;
      } else if (this.g == 3) {
         this.h = 3;
      } else if (this.g == 4) {
         if (this.a.compareTo(k.a[109]) == 0) {
            this.h = 6;
         } else {
            this.h = 4;
         }
      } else if (this.g == 5) {
         this.h = 5;
      } else if (this.g == 7) {
         this.h = 7;
      } else if (this.g == 8) {
         this.h = 8;
      } else if (this.g == 9) {
         this.h = 9;
      } else if (this.g == 10) {
         this.h = 10;
      } else if (this.g == 11) {
         this.h = 11;
      } else {
         this.h = 1;
      }

      a.f(this.h);
      if (this.g != 2 && this.g != 4 && this.g != 10 && this.g != 7) {
         if (!k.c) {
            this.f = 0;
         } else {
            this.f = j;
         }
      } else {
         this.f = this.f > -1 ? 0 : -1;
      }

      k.c = false;
      j = 0;
   }

   public final void a(Graphics var1) {
      if (this.g == 3 && n.a.y == 11) {
         a.f(12);
      } else {
         a.f(this.h);
      }

      int var2;
      if (this.g == 3 && n.a.y != 11) {
         var2 = (n.a.c - n.a.e - n.a.d - 8) / 16;
         n.a.i = n.a.c - n.a.d;
      } else {
         var2 = (n.a.i - n.a.e - 8) / 16;
      }

      n.a.b(var1, 0, 16, n.a.b, n.a.i - 16, 2);
      if (this.a != null && this.a.a > 1) {
         if (this.a.a(this.f + 1) != null) {
            n.a.b = this.a.a(this.f + 1);
         }

         if (this.g == 2 || this.g == 4 || this.g == 10 || this.g == 7) {
            this.b(var1);
            --var2;
         }

         int var3;
         if ((var3 = this.f - var2 + 1) < 0) {
            var3 = 0;
         }

         int var4;
         if ((var4 = var3 + var2) >= this.e) {
            var4 = this.e;
         }

         if (this.g != 2 && this.g != 4 && this.g != 10 && this.g != 7) {
            var1.translate(0, n.a.e + 5);
         }

         int var5 = -1;
         if (this.a.compareTo(k.a[19]) == 0) {
            var5 = (int)n.a.b().a(k.a[179]).a(k.a[155]).a[1];
         } else if (this.a.compareTo(k.a[179]) == 0 || this.a.compareTo(k.a[143]) == 0) {
            var5 = (int)n.a.b().a(k.a[179]).a(k.a[156]).a[1];
         }

         for(int var6 = var3; var6 < var4; ++var6) {
            if (this.f == var6) {
               if (var5 != -1) {
                  Integer.parseInt(n.a.b.a(k.a[162]));
               }

               this.a[var6].a = true;
            } else {
               this.a[var6].a = false;
            }

            this.a[var6].a(var1);
            var1.translate(0, 16);
         }

         if ((this.g != 3 || n.a.y == 11) && (this.g != 4 || this.a.compareTo(k.a[109]) == 0)) {
            var1.translate(0 - var1.getTranslateX(), 0 - var1.getTranslateY());
            a.a(this.a.a(this.f + 1), this.a);
            a.a(var1);
         }

         var1.translate(0 - var1.getTranslateX(), 0 - var1.getTranslateY());
         int var7 = 22;
         if (this.e > 1 && this.f > -1) {
            var7 = 22 + (int)a.a(a.c(a.b((long)(n.a.i - 22)), a.b((long)(this.e + 1))) * (long)this.f);
         }

         if (this.f == this.e - 1 || var7 > n.a.i - 22) {
            var7 = n.a.i - 22;
         }

         var1.setClip(0, 0, n.a.b, n.a.c);
         var1.drawRegion(n.a.a, 135, 95, 3, 16, 0, n.a.b - 3, var7, 20);
      } else {
         n.a.a(this.b);
         n.a.a(n.a.b, n.a.b, 2, 1);
         n.a.a(n.a.b / 2, n.a.e + 18, var1);
         if (this.g == 8 || this.g == 4 || this.g == 10) {
            var1.translate(0 - var1.getTranslateX(), 0 - var1.getTranslateY());
            a.a((h)null, this.a);
            a.a(var1);
         }

      }
   }

   public final h a(int var1) {
      if (var1 == 53) {
         this.e(var1);
         return null;
      } else {
         j = this.f;
         h var2 = new h(1);
         short var3 = 0;
         if (this.a != null && this.a.a > 1) {
            if (this.a.compareTo(k.a[19]) == 0) {
               var3 = 5;
            } else if (this.a.compareTo(k.a[179]) == 0) {
               if (Integer.parseInt(n.a.b.a(k.a[162])) == 65) {
                  var2.a((String)k.a[123], (Object)this.a.a(this.f + 1).a(k.a[123]));
                  var3 = 28;
               } else if (Integer.parseInt(n.a.b.a(k.a[162])) == 69) {
                  var3 = 92;
               } else if (Integer.parseInt(n.a.b.a(k.a[162])) == 68) {
                  var3 = 115;
               } else {
                  var3 = 26;
               }
            } else if (this.a.compareTo(k.a[143]) == 0) {
               if (Integer.parseInt(this.a.a(this.f + 1).a(k.a[162])) != 23 && Integer.parseInt(this.a.a(this.f + 1).a(k.a[162])) != 28) {
                  var3 = 5;
               } else {
                  var3 = 26;
               }
            } else if (this.a.compareTo(k.a[161]) == 0) {
               var3 = 26;
            } else if (this.a.compareTo(k.a[103]) == 0) {
               var3 = 94;
            } else if (this.a.compareTo(k.a[243]) == 0) {
               var3 = 97;
            }

            if (this.a.compareTo(k.a[34]) == 0) {
               if (this.f != -1) {
                  if (this.a.a(this.f + 1).a(k.a[123]) == null) {
                     var3 = 8;
                  } else {
                     var3 = 12;
                  }
               } else {
                  if (this.i == 0) {
                     if (this.b) {
                        this.b = false;
                        this.b.setLength(0);
                        this.b.append(this.c);
                        this.e.setLength(0);
                        this.e.append(this.d);
                     } else {
                        var3 = 29;
                     }
                  }

                  if (this.b.length() == 0) {
                     this.b.append(this.c);
                  }

                  if (this.e.length() == 0) {
                     this.e.append(this.d);
                  }

                  if (this.i == 3) {
                     if (this.b) {
                        var3 = 31;
                        n.a.c.a(k.a[53]).a(k.a[54]).a((Object)(this.b + k.a[4] + this.e), (String)k.a[170]);
                     } else {
                        var3 = 30;
                     }
                  }
               }
            } else if (this.a.compareTo(k.a[109]) == 0) {
               if (this.f != -1) {
                  if (Integer.parseInt(n.a.b.a(k.a[162])) < 6) {
                     var3 = 49;
                  } else {
                     var3 = 48;
                  }
               } else {
                  if (this.i == 0) {
                     if (this.b) {
                        this.b = false;
                        this.b.setLength(0);
                        this.b.append(this.c);
                     } else {
                        var3 = 69;
                        if (this.b.length() == 0) {
                           this.b.append(this.c);
                        }

                        var2.a[0] = (long)Integer.parseInt(this.b.toString());
                     }
                  }

                  if (this.i == 3) {
                     if (this.b.length() == 0) {
                        this.b.append(this.c);
                     }

                     var2.a[0] = (long)Integer.parseInt(this.b.toString());
                     if (this.b) {
                        var3 = 70;
                     } else {
                        var3 = 68;
                     }
                  }
               }
            } else if (this.a.compareTo(k.a[249]) == 0) {
               if (this.f != -1) {
                  if (n.a.f == 1) {
                     var3 = 106;
                  } else if (n.a.f == 3) {
                     var3 = 119;
                  }
               } else {
                  if (this.i == 0) {
                     if (this.b) {
                        this.b = false;
                        this.b.setLength(0);
                        this.b.append(this.c);
                     } else {
                        var3 = 108;
                        if (this.b.length() == 0) {
                           this.b.append(this.c);
                        }

                        var2.a[0] = (long)Integer.parseInt(this.b.toString());
                     }
                  }

                  if (this.i == 3) {
                     if (this.b.length() == 0) {
                        this.b.append(this.c);
                     }

                     var2.a[0] = (long)Integer.parseInt(this.b.toString());
                     if (this.b) {
                        var3 = 109;
                     } else {
                        var3 = 107;
                     }
                  }
               }
            } else if (this.a.compareTo(k.a[176]) == 0) {
               if (this.f != -1) {
                  var3 = 54;
               } else {
                  if (this.i == 0) {
                     if (this.b) {
                        this.b = false;
                        this.b.setLength(0);
                        this.b.append(this.c);
                     } else {
                        var3 = 132;
                        if (this.b.length() == 0) {
                           this.b.append(this.c);
                        }

                        var2.a[0] = (long)Integer.parseInt(this.b.toString());
                     }
                  }

                  if (this.i == 3) {
                     if (this.b.length() == 0) {
                        this.b.append(this.c);
                     }

                     var2.a[0] = (long)Integer.parseInt(this.b.toString());
                     if (this.b) {
                        var3 = 133;
                     } else {
                        var3 = 131;
                     }
                  }
               }
            } else if (this.a.compareTo(k.a[13]) == 0) {
               if (this.g == 11) {
                  var3 = 120;
               } else {
                  var3 = 12;
               }
            } else if (this.a.compareTo(k.a[132]) == 0) {
               var3 = 36;
            } else if (this.a.compareTo(k.a[128]) == 0) {
               var3 = 37;
            } else if (this.a.compareTo(k.a[131]) == 0) {
               var3 = 38;
            } else if (this.a.compareTo(k.a[133]) == 0) {
               var3 = 39;
            } else if (this.a.compareTo(k.a[134]) == 0) {
               var3 = 40;
            } else if (this.a.compareTo(k.a[129]) == 0) {
               var3 = 42;
            } else if (this.a.compareTo(k.a[130]) == 0) {
               var3 = 43;
            } else if (this.a.compareTo(k.a[176]) == 0) {
               var3 = 54;
            } else if (this.a.compareTo(k.a[263]) == 0) {
               var3 = 117;
            } else {
               var2.a[0] = this.a.a(this.f + 1).a[0];
            }
         } else {
            var3 = -99;
         }

         if (var3 == 36 || var3 == 37 || var3 == 38 || var3 == 39 || var3 == 40 || var3 == 42 || var3 == 43 || var3 == 5 && ((i)n.a.a.a.a.a).c() || var3 == 117) {
            n.a.setLength(0);

            for(int var4 = 0; var4 < this.e; ++var4) {
               if (this.a[var4].a.length() > 0) {
                  if (this.a[var4].b == 3) {
                     n.a.append(k.a[246]).append(this.a[var4].c).append(k.a[5]).append(this.a[var4].a);
                  } else {
                     n.a.append(k.a[142]).append(this.a[var4].c).append(k.a[5]).append(this.a[var4].a);
                  }
               }
            }

            var2.a((String)k.a[173], (Object)n.a.toString());
         }

         if (var3 != 0) {
            var2.a((String)k.a[50], (Object)(new Integer(var3)));
            return var2;
         } else {
            return null;
         }
      }
   }

   public final String a() {
      n.a.setLength(0);

      for(int var1 = 0; var1 < this.e; ++var1) {
         if (this.a[var1].a.length() > 0) {
            n.a.append(n.a.c.a(k.a[109]).a(var1 + 1).a(k.a[119])).append(k.a[2]);
         }
      }

      if (n.a.length() > 0) {
         n.a.setLength(n.a.length() - 1);
         n.a.append(k.a[261]);

         for(int var2 = 0; var2 < this.e; ++var2) {
            if (this.a[var2].a.length() > 0) {
               n.a.append(this.a[var2].c).append(k.a[2]);
            }
         }

         n.a.setLength(n.a.length() - 1);
         return n.a.toString();
      } else {
         n.a.append(n.a.c.a(k.a[109]).a(this.f + 1).a(k.a[119])).append(k.a[261]).append(this.a[this.f].c);
         return n.a.toString();
      }
   }

   public final void a(int var1) {
      if (this.a != null && this.a.a > 1) {
         if (var1 == 56) {
            this.e(var1);
         } else {
            if (this.f + 1 < this.e || this.g != 2 && this.g != 4 && this.g != 10 && this.g != 7) {
               this.f = ++this.f % this.e;
            } else {
               this.f = -1;
            }

            if (this.g != 3) {
               a.a = this.a.a(this.f + 1);
            }
         }

         if (this.f + 1 >= this.a.a && this.g == 3) {
            n.a.b = n.a.e.a(this.f - this.a.a + 2);
         } else {
            n.a.b = this.a.a(this.f + 1);
         }

         if (this.g == 3) {
            if (n.a.b.a(k.a[170]) == null) {
               n.a.p = Integer.parseInt(n.a.b.a(k.a[54]));
            } else {
               n.a.p = 0;
            }
         }

         if (this.a.startsWith(k.a[34]) || this.a.startsWith(k.a[13])) {
            n.a.f = n.a.b;
         }

      }
   }

   public final void b(int var1) {
      if (this.a != null && this.a.a > 1) {
         if (var1 == 50) {
            this.e(var1);
         } else {
            --this.f;
            if (this.g != 2 && this.g != 4 && this.g != 10 && this.g != 7) {
               if (this.f == -1) {
                  this.f = this.e - 1;
               }
            } else if (this.f == -2) {
               this.f = this.e - 1;
            }

            if (this.g != 3) {
               a.a = this.a.a(this.f + 1);
            }
         }

         if (this.f + 1 >= this.a.a && this.g == 3) {
            n.a.b = n.a.e.a(this.f - this.a.a + 2);
         } else {
            n.a.b = this.a.a(this.f + 1);
         }

         if (this.g == 3) {
            if (n.a.b.a(k.a[170]) == null) {
               n.a.p = Integer.parseInt(n.a.b.a(k.a[54]));
            } else {
               n.a.p = 0;
            }
         }

         if (this.a.startsWith(k.a[34]) || this.a.startsWith(k.a[13])) {
            n.a.f = n.a.b;
         }

      }
   }

   public final void c(int var1) {
      if (var1 == 54) {
         this.e(var1);
      } else {
         this.i = ++this.i % 4;
         if (this.g == 4 || this.g == 10 || this.g == 7) {
            this.i = this.i == 2 ? 3 : this.i;
         }

      }
   }

   public final void d(int var1) {
      if (var1 == 52) {
         this.e(var1);
      } else {
         this.i = --this.i % 4;
         if (this.i < 0) {
            this.i = 3;
         }

         if (this.g == 4 || this.g == 10 || this.g == 7) {
            this.i = this.i == 2 ? 1 : this.i;
         }

      }
   }

   public final void e(int var1) {
      if ((this.g == 2 || this.g == 4 || this.g == 10 || this.g == 7) && this.i > 0 && this.i < 3 && this.f == -1) {
         StringBuffer var2 = this.a();
         if (!this.b && (var2.length() < 3 || var1 == 42 || var1 == -8)) {
            this.c.setLength(0);
            this.d.setLength(0);
            this.c.append(this.b);
            this.d.append(this.e);
            this.b = true;
         }

         if ((var1 == 42 || var1 == -8) && var2.length() > 0) {
            var2.setLength(var2.length() - 1);
            this.a(var2);
         } else {
            if (var2.length() < 3 && var1 >= 48 && var1 <= 57) {
               var2.append(var1 - 48);
            }

            this.a(var2);
         }
      } else {
         if (this.g == 3 || this.g == 6 && this.a.a(this.f + 1).a[0] == 0L && Integer.parseInt(this.a.a(this.f + 1).a(k.a[162])) != 23 && Integer.parseInt(this.a.a(this.f + 1).a(k.a[162])) != 28) {
            if (this.g == 3 && n.a.y == 11 && this.a[this.f].a.length() > 0) {
               k var10000 = n.a;
               var10000.l -= (long)(n.a.a() * Integer.parseInt(this.a[this.f].a.toString()));
            } else {
               if (this.g == 3 && n.a.y == 2 && this.a[this.f].c != 9) {
                  n.a.a.b = "Casusluk için sadece casus kuþ seçilebilir!";
                  return;
               }

               if (this.g == 3 && n.a.y == 1 && this.a[this.f].c == 9) {
                  n.a.a.b = "Saldýrýlarda casus kuþ kullanýlamaz!";
                  return;
               }
            }

            this.a[this.f].a(var1);
            if (this.g == 3 && n.a.y == 11 && this.a[this.f].a.length() > 0) {
               k var3 = n.a;
               var3.l += (long)(n.a.a() * Integer.parseInt(this.a[this.f].a.toString()));
               return;
            }
         } else if (this.g == 4 && this.f != -1) {
            this.a[this.f].a(var1);
         }

      }
   }

   public final String b() {
      return this.a[this.f].a;
   }

   public final d b() {
      return this.a[this.f];
   }

   private StringBuffer a() {
      if (this.i == 1) {
         return this.b;
      } else {
         return this.i == 2 ? this.e : null;
      }
   }

   private void a(StringBuffer var1) {
      if (this.i == 1) {
         this.b = var1;
      } else {
         if (this.i == 2) {
            this.e = var1;
         }

      }
   }

   public final boolean a() {
      boolean var1 = false;
      if (this.g != 3 && this.a != null && this.a.a > 1 && ((var1 = this.b()) || this.c)) {
         a.a();
         var1 = true;
      }

      return var1;
   }

   public final void g(int var1) {
      if (var1 == 3) {
         for(int var7 = 0; var7 < this.a.length; ++var7) {
            if (this.a[var7].a.length() == 0) {
               this.a[var7].a.append(1);
            }
         }

      } else {
         h var2 = n.a.b().a(k.a[19]);

         for(int var4 = 1; var4 < var2.a; ++var4) {
            h var3 = var2.a(var4);
            if (var1 == 1) {
               if (var3.a[1] > 0L) {
                  this.a[var4 - 1].a.setLength(0);
                  if ((n.a.y != 1 || this.a[var4 - 1].c != 9) && (n.a.y != 2 || this.a[var4 - 1].c == 9)) {
                     this.a[var4 - 1].a.append(var3.a[1]);
                  }
               }
            } else if (Integer.parseInt(var3.a(k.a[54])) > 0) {
               this.a[var4 - 1].a.setLength(0);
               this.a[var4 - 1].a.append(var3.a(k.a[54]));
            }
         }

         int var8 = var2.a - 1;
         int var5 = 0;

         for(int var6 = 1; var6 < n.a.e.a; ++var6) {
            if (var1 == 1) {
               if (Integer.parseInt(n.a.e.a(var6).a(k.a[170])) == 2 && this.a[var8 + var5].a.length() == 0) {
                  this.a[var8 + var5].a.append(1);
                  ++var5;
               }
            } else if (Integer.parseInt(n.a.e.a(var6).a(k.a[170])) == 3 && this.a[var8 + var5].a.length() == 0) {
               this.a[var8 + var5].a.append(1);
               ++var5;
            }
         }

      }
   }

   public final boolean b() {
      this.c = false;
      int var1 = 0;
      Object var2 = null;

      for(int var3 = 1; var3 < this.a.a; ++var3) {
         h var6;
         if ((var1 = Integer.parseInt((var6 = this.a.a(var3)).a(k.a[162]))) != 65 && var1 != 68) {
            if (this.a.compareTo(k.a[161]) == 0 && var6.a[2] > 0L) {
               String var7;
               if ((var7 = var6.a(k.a[187])) != null && var7.length() > 0 && n.a.a().compareTo(var7) == 0) {
                  return true;
               }
            } else if (var6.a[2] > 0L) {
               return true;
            }
         } else {
            int var4;
            if ((var4 = Integer.parseInt(var6.a(k.a[123]))) == 11 || var4 == 12 || var4 == 15 || var4 == 17) {
               this.c = true;
               return false;
            }

            if (var6.a[2] > 0L) {
               return true;
            }
         }
      }

      return false;
   }

   public final boolean a(int var1) {
      for(int var2 = this.a.a - 1; var2 >= 0; --var2) {
         if (Integer.parseInt(this.a.a(var2).a(k.a[162])) == var1) {
            if (this.a.a(var2).a[2] > 0L) {
               return true;
            }

            return false;
         }
      }

      return false;
   }

   public final boolean c() {
      for(int var1 = 0; var1 < this.a.length; ++var1) {
         if (this.a[var1].a.length() != 0) {
            return true;
         }
      }

      return false;
   }
}
