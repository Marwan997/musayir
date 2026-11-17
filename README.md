# Ranna · رنّة

Landing page for Ranna, cloud calling for Saudi businesses. Static HTML, CSS and plain JavaScript, with no build step.

- `index.html`: the page. Arabic first (RTL), with every string also in English. Text is paired as `<span lang="ar">` / `<span lang="en">`, and the stylesheet hides the language that isn't active.
- `styles.css`: Equalizer palette (ink `#111111`, lime `#C6F432`, chalk `#F4F4EF`), IBM Plex Sans Arabic and IBM Plex Sans.
- `main.js`: language switch (saved per visitor; `?lang=en` or `#en` opens English), mobile menu, the hero call console, the 60-second call demo, and the contact form (opens the visitor's mail app to info@ranna.sa until a real endpoint exists).
- `assets/brand/`: logo, favicon and app icons.

Run it locally by opening `index.html`, or `python3 -m http.server` in this folder.

All numbers, names and phone numbers inside the product mock-ups are examples.
