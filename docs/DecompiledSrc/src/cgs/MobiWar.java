package cgs;

import javax.microedition.lcdui.Command;
import javax.microedition.lcdui.CommandListener;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Displayable;
import javax.microedition.midlet.MIDlet;

public class MobiWar extends MIDlet implements CommandListener {
   private .c a;
   private .k a;

   private void a() {
      this.a = new .k();
      this.a = new .c();
      this.a.a = this;
      this.a.a(this.a);
      this.a.a();
      Display.getDisplay(this).setCurrent(this.a);
   }

   public final void startApp() {
      this.a();
   }

   public final void pauseApp() {
   }

   public final void destroyApp(boolean var1) {
      ((MIDlet)this).notifyDestroyed();
   }

   public void MobiWar() {
      this.a.setCommandListener(this);
   }

   public void commandAction(Command var1, Displayable var2) {
      if (this.a.a) {
         this.destroyApp(true);
      }

   }
}
