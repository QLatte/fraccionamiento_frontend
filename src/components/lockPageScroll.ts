let locks = 0;
let restore: (() => void) | undefined;

function preserve(style: CSSStyleDeclaration, properties: string[]) {
  const values = properties.map(property => [property, style.getPropertyValue(property), style.getPropertyPriority(property)]);
  return () => values.forEach(([property, value, priority]) => {
    if (value) style.setProperty(property, value, priority);
    else style.removeProperty(property);
  });
}

// Fixed-body locking also covers mobile browsers where overflow alone is insufficient.
// Reference counting keeps the background locked when dialogs overlap.
export function lockPageScroll() {
  if (locks === 0) {
    const root = document.documentElement;
    const body = document.body;
    const x = window.scrollX;
    const y = window.scrollY;
    const scrollbar = Math.max(0, window.innerWidth - root.clientWidth);
    const paddingRight = getComputedStyle(body).paddingRight;
    const restoreRoot = preserve(root.style, ['overflow', 'overscroll-behavior', 'scroll-behavior']);
    const restoreBody = preserve(body.style, ['position', 'top', 'left', 'width', 'overflow', 'overscroll-behavior', 'padding-right']);

    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    root.style.scrollBehavior = 'auto';
    body.style.position = 'fixed';
    body.style.top = `${-y}px`;
    body.style.left = `${-x}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    if (scrollbar) body.style.paddingRight = `calc(${paddingRight} + ${scrollbar}px)`;

    restore = () => {
      restoreBody();
      // Restore the position before re-enabling any page-level smooth scrolling.
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
      restoreRoot();
    };
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks === 0) { restore?.(); restore = undefined; }
  };
}
