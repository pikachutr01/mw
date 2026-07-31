import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Hashtable;
import javax.microedition.lcdui.Image;

public final class b {
   private static Hashtable a = new Hashtable();
   private String b;
   public Image a;
   public byte[] a;
   public short[] a;
   public String a;
   public int a;
   public int b;

   private b(String var1) {
      this.b = var1;
   }

   public final r a(String var1) {
      if (this.a == null) {
         InputStream var2 = null;

         try {
            if ((var2 = this.getClass().getResourceAsStream(this.b)) != null) {
               DataInputStream var21;
               (var21 = new DataInputStream(var2)).readBoolean();
               String var4 = var21.readUTF();
               this.a = var4;
               this.b = var4.indexOf(32);
               int var5 = var4.length();
               this.a = new byte[var5];
               this.a = new short[var5];
               short var6 = 0;

               for(int var7 = 0; var7 < var5; ++var7) {
                  byte var8 = var21.readByte();
                  this.a[var7] = var8;
                  this.a[var7] = var6;
                  var6 = (short)(var6 + var8);
               }

               ByteArrayOutputStream var22 = new ByteArrayOutputStream();
               byte[] var23 = new byte[1024];

               int var9;
               while((var9 = var2.read(var23, 0, var23.length)) != -1) {
                  var22.write(var23, 0, var9);
               }

               var23 = var22.toByteArray();
               this.a = Image.createImage(var23, 0, var23.length);
               this.a = this.a.getHeight();
               this.b = null;
               return new r(this, var1);
            }

            Object var3 = null;
         } catch (IOException var19) {
            return null;
         } finally {
            try {
               var2.close();
            } catch (IOException var18) {
            }

         }

         return null;
      } else {
         return new r(this, var1);
      }
   }

   public static b a(String var0) {
      b var1;
      if ((var1 = (b)a.get(var0)) == null) {
         var1 = new b(var0);
         a.put(var0, var1);
      }

      return var1;
   }
}
