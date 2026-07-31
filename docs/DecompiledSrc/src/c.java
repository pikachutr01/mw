import cgs.MobiWar;
import com.nokia.mid.ui.FullCanvas;
import javax.microedition.lcdui.Canvas;
import javax.microedition.lcdui.Graphics;

public final class c extends FullCanvas {
   private k a = null;
   public g a = null;
   public MobiWar a;

   public final void paint(Graphics var1) {
      if (this.a.a > 0) {
         var1.translate(this.a.b / 2 - 22, this.a.c / 2 - 22);
         this.a.a(114, var1, 0, 0, 20);
         var1.translate(0 - var1.getTranslateX(), 0 - var1.getTranslateY());
      } else {
         try {
            this.a.a(var1);
         } catch (Exception var3) {
         }
      }
   }

   public final void a(k var1) {
      this.a = var1;
      var1.a = this;
   }

   public final void keyPressed(int var1) {
      try {
         this.a.a(var1);
         if (this.a.a) {
            this.a.destroyApp(true);
         } else {
            ((Canvas)this).repaint();
         }

      } catch (Exception var3) {
      }
   }

   public final void keyRepeated(int var1) {
      if (var1 >= 48 && var1 <= 57) {
         this.a.b = 1;
      }

      this.keyPressed(var1);
   }

   public final void keyReleased(int var1) {
      this.a.b = 0;
   }

   public final void a() {
      this.a.a(((FullCanvas)this).getHeight());
      this.a.b(((FullCanvas)this).getWidth());
      this.a.a();
      this.a = new g(this.a);
   }
}
