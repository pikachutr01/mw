public final class h {
   private String[] a;
   private Object[] a;
   public boolean a = false;
   public long[] a;
   public int a = 0;

   public h(int var1) {
      this.a = new String[var1];
      this.a = new Object[var1];
      this.a = new long[3];
   }

   public final int a(String var1, Object var2) {
      if (this.a == this.a.length) {
         String[] var3 = new String[this.a + 4];
         Object[] var4 = new Object[this.a + 4];
         System.arraycopy(this.a, 0, var3, 0, this.a);
         System.arraycopy(this.a, 0, var4, 0, this.a);
         this.a = var3;
         this.a = var4;
      }

      this.a[this.a] = var1;
      this.a[this.a] = var2;
      ++this.a;
      return this.a - 1;
   }

   public final Object a(String var1) {
      for(int var2 = 0; var2 < this.a; ++var2) {
         if (this.a[var2].compareTo(var1) == 0) {
            return this.a[var2];
         }
      }

      return null;
   }

   public final h a(String var1) {
      return (h)this.a(var1);
   }

   public final String a(String var1) {
      return (String)this.a(var1);
   }

   public final void a(Object var1, String var2) {
      for(int var3 = 0; var3 < this.a; ++var3) {
         if (this.a[var3].compareTo(var2) == 0) {
            this.a[var3] = var1;
            return;
         }
      }

      this.a(var2, var1);
   }

   public final Object a(int var1) {
      return this.a.length <= var1 ? null : this.a[var1];
   }

   public final h a(int var1) {
      return (h)this.a[var1];
   }

   public final String a(int var1) {
      return (String)this.a[var1];
   }

   public final void a(Object var1, int var2) {
      this.a[var2] = var1;
   }

   public final String b(int var1) {
      return this.a[var1];
   }

   public final int a(String var1) {
      for(int var2 = 0; var2 < this.a; ++var2) {
         if (this.a[var2].compareTo(var1) == 0) {
            return var2;
         }
      }

      return -1;
   }

   public final void a(int var1, String var2) {
      this.a[var1] = var2;
   }

   public final void a(int var1) {
      if (var1 >= 0 && var1 < this.a) {
         ((h)this.a[var1]).a();
         String[] var2 = new String[this.a - 1];
         Object[] var3 = new Object[this.a - 1];
         System.arraycopy(this.a, 0, var2, 0, var1);
         System.arraycopy(this.a, 0, var3, 0, var1);
         if (var1 + 1 < this.a) {
            System.arraycopy(this.a, var1 + 1, var2, var1, this.a - var1 - 1);
            System.arraycopy(this.a, var1 + 1, var3, var1, this.a - var1 - 1);
         }

         this.a = var2;
         this.a = var3;
         --this.a;
      }
   }

   public final void a(Object var1) {
      for(int var2 = 0; var2 < this.a; ++var2) {
         if (this.a[var2] != null && this.a[var2].equals(var1)) {
            this.a(var2);
            return;
         }
      }

   }

   public final void a(h var1) {
      for(int var2 = 0; var2 < var1.a; ++var2) {
         if (this.a(var1.b(var2)) <= -1) {
            this.a(var1.b(var2), var1.a(var2));
         }
      }

   }

   public final void a() {
      for(int var1 = 0; var1 < this.a; ++var1) {
         if (this.a[var1] != null && this.a[var1].getClass() == this.getClass()) {
            ((h)this.a[var1]).a();
         }

         this.a[var1] = null;
         this.a[var1] = null;
      }

      this.a = false;
      this.a = 0;
      this.a[0] = 0L;
      this.a[1] = 0L;
      this.a[2] = 0L;
   }
}
