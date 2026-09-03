/**
 * Réduit une photo prise au téléphone avant l'envoi.
 *  - les fonctions serverless (Vercel) plafonnent le corps de requête à ~4,5 Mo ;
 *    une photo brute de smartphone fait souvent 3 à 8 Mo → la DI échouerait.
 *  - on redimensionne à 1600 px max sur le grand côté, JPEG qualité 0,72
 *    → en général 150 à 400 Ko, largement suffisant pour un constat terrain.
 * En cas d'échec (format exotique, pas de canvas), on renvoie le fichier d'origine.
 */
export async function downscaleImage(file: Blob, maxSide = 1600, quality = 0.72): Promise<Blob> {
  try {
    if (!file.type.startsWith('image/')) return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    // si le redimensionnement n'a rien gagné, on garde l'original
    if (!blob || blob.size >= file.size) return file;
    return blob;
  } catch {
    return file;
  }
}
