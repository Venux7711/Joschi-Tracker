-- Nur nachsehen: Was lässt der Speicher-Bucket tatsächlich zu?
--
-- Migration 019 hat die Obergrenze auf 100 MB gesetzt und Video-Typen
-- freigegeben. Ob das angekommen ist, wurde nie überprüft – die Anweisung war
-- gegen fehlende Rechte abgesichert und hätte stillschweigend nichts tun
-- können. Genau davon hängt aber ab, ob sich das Verkleinern überhaupt lohnt:
-- Liegt die Grenze hoch genug, kann das Video unverändert hochgeladen werden.
--
-- Diese Migration verändert nichts.

SELECT
  id,
  public,
  file_size_limit,
  round(file_size_limit / 1048576.0, 1) AS grenze_mb,
  allowed_mime_types
FROM storage.buckets;
