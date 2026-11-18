# Test fixtures

Pages saved from each source so the parsers can be tested offline.

- `ac-*`: aftercredits.com search results, REST API responses and film pages.
- `ms-*`: MediaStinger search results.

Both are cut down to the markup the parsers read: result titles, links, the
yes/no answers, the scene headings and the vote count. The sites' own text
(scene descriptions, synopses, reader comments) is removed.

- `wiki-*.wikitext`: the source of Wikipedia's "List of films with
  post-credits scenes" pages, by period, saved on 2026-11-18. Wikipedia
  content is available under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); the
  authors are listed in each page's history:
  [before 2000](https://en.wikipedia.org/w/index.php?title=List_of_films_with_post-credits_scenes_(before_2000)&action=history),
  [2010s](https://en.wikipedia.org/w/index.php?title=List_of_films_with_post-credits_scenes_(2010s)&action=history),
  [2020s](https://en.wikipedia.org/w/index.php?title=List_of_films_with_post-credits_scenes_(2020s)&action=history).
