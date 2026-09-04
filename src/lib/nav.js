// nav.js — the single source of truth for the site's navigation links.
//
// Lives in lib/ rather than in Navbar.jsx because MobileMenu also needs it,
// and Navbar already imports MobileMenu — putting it in Navbar created a
// circular import (Navbar -> MobileMenu -> Navbar). That happens to work for
// hoisted function declarations, but it's a trap waiting for the next edit.
//
// Why it's a function of `categories` and not a constant: the nav used to be
// a hardcoded [Bags, Jewelry, Watches, About] array, which quietly made
// admin -> Categories a half-feature. The owner could create a category and
// assign products to it, /category/<slug> rendered correctly — and no
// customer could reach it, because nothing linked there. Adding "Sunglasses"
// for real is what exposed it. Now the nav IS the categories table.
export function navLinks(categories = []) {
  return [
    // One link per category row, in the order the owner created them.
    ...categories.map((c) => ({ label: c.name, to: `/category/${c.slug}` })),
    // About is a page, not a category, so it's appended rather than stored.
    { label: 'About', to: '/about' },
  ];
}
