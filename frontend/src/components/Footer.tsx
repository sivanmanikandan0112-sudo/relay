const SUPPORT_EMAIL = "relaycoach.app@gmail.com";

// Shared between Layout.tsx (every authenticated page, coach or athlete)
// and Home.tsx (the public landing page, before anyone's signed in) --
// together those two spots put this within reach of literally any
// visitor, without duplicating a one-line footer across every page
// individually. Deliberately just a mailto: link, not a feedback form --
// no backend endpoint to build or maintain for something this
// low-volume, and it opens directly in whatever mail client is already
// signed in on the visitor's own device.
export function Footer() {
  return (
    <footer className="app-footer">
      Found a bug, have a question, or an idea? <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
    </footer>
  );
}
