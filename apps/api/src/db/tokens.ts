/**
 * DI belirteci ayrı dosyada: `app.module.ts` guard/controller'ları içe aktarıyor, onlar da
 * belirteci — aynı dosyada olsa döngüsel bağımlılık olurdu.
 */
export const DB = Symbol('DB');
