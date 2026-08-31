-- Nur nachsehen: Was ist bei den Katzengedanken tatsächlich herausgekommen?
--
-- Am Ton zu drehen, ohne den Text gesehen zu haben, wäre wieder Raten. Vor
-- allem eine Frage muss beantwortet sein: Kam der Satz von der KI oder aus
-- meinen fest verdrahteten Ersatzzeilen? Das sind zwei völlig verschiedene
-- Baustellen.
--
-- Diese Migration verändert nichts.

SELECT tag, stimme, erzeugt_von, text, left(grundlage, 260) AS grundlage
FROM cat_thoughts
ORDER BY tag DESC, stimme;
