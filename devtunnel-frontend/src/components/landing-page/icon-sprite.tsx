/**
 * Hidden SVG sprite used by every `<Ic id="..." />` on the landing page.
 * Rendered once, at the top of the page.
 */
export function IconSprite() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <symbol id="dti-folder" viewBox="0 0 24 24">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        </symbol>
        <symbol id="dti-task" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="3"></rect>
          <path d="m8 12 3 3 5-6"></path>
        </symbol>
        <symbol id="dti-pkg" viewBox="0 0 24 24">
          <path d="M12 3 3 7.5v9L12 21l9-4.5v-9z"></path>
          <path d="M3 7.5 12 12l9-4.5M12 12v9"></path>
        </symbol>
        <symbol id="dti-issue" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9"></circle>
          <circle cx="12" cy="12" r="1.2"></circle>
        </symbol>
        <symbol id="dti-search" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7"></circle>
          <path d="m20 20-3.5-3.5"></path>
        </symbol>
        <symbol id="dti-chev" viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6"></path>
        </symbol>
        <symbol id="dti-menu" viewBox="0 0 24 24">
          <path d="M4 7h16M4 12h16M4 17h16"></path>
        </symbol>
        <symbol id="dti-term" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="16" rx="3"></rect>
          <path d="m7 10 3 2-3 2M12 15h5"></path>
        </symbol>
        <symbol id="dti-flow" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="2"></circle>
          <circle cx="12" cy="12" r="2"></circle>
          <circle cx="19" cy="12" r="2"></circle>
          <path d="M7 12h3M14 12h3"></path>
        </symbol>
        <symbol id="dti-spark" viewBox="0 0 24 24">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"></path>
        </symbol>
        <symbol id="dti-book" viewBox="0 0 24 24">
          <path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z"></path>
          <path d="M5 16a4 4 0 0 1 4-4h10"></path>
        </symbol>
        <symbol id="dti-log" viewBox="0 0 24 24">
          <path d="M6 3h9l4 4v14H6z"></path>
          <path d="M14 3v5h5M9 13h6M9 17h6"></path>
        </symbol>
        <symbol id="dti-layers" viewBox="0 0 24 24">
          <path d="m12 3 9 5-9 5-9-5z"></path>
          <path d="m3 13 9 5 9-5"></path>
        </symbol>
        <symbol id="dti-map" viewBox="0 0 24 24">
          <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"></path>
          <path d="M9 4v14M15 6v14"></path>
        </symbol>
        <symbol id="dti-shield" viewBox="0 0 24 24">
          <path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z"></path>
        </symbol>
        <symbol id="dti-heart" viewBox="0 0 24 24">
          <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"></path>
        </symbol>
        <symbol id="dti-mail" viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="14" rx="3"></rect>
          <path d="m4 8 8 6 8-6"></path>
        </symbol>
        <symbol id="dti-arrow" viewBox="0 0 24 24">
          <path d="M5 12h14M13 6l6 6-6 6"></path>
        </symbol>
        <symbol id="dti-copy" viewBox="0 0 24 24">
          <rect x="8" y="8" width="12" height="12" rx="2.5"></rect>
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
        </symbol>
        <symbol id="dti-users" viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="3.2"></circle>
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"></path>
          <circle cx="17" cy="9" r="2.4"></circle>
          <path d="M17 14.2c2.4 0 4 1.8 4 4.8"></path>
        </symbol>
        <symbol id="dti-gh" viewBox="0 0 16 16">
          <path fill="currentColor" stroke="none" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"></path>
        </symbol>
        <symbol id="dti-pr" viewBox="0 0 24 24">
          <circle cx="6" cy="6" r="2.5"></circle>
          <circle cx="6" cy="18" r="2.5"></circle>
          <circle cx="18" cy="18" r="2.5"></circle>
          <path d="M6 8.5v7M18 15.5V10a3 3 0 0 0-3-3h-3m0 0 2.2-2.2M12 7l2.2 2.2"></path>
        </symbol>
        <symbol id="dti-pause" viewBox="0 0 24 24">
          <path d="M8 5v14M16 5v14"></path>
        </symbol>
        <symbol id="dti-playb" viewBox="0 0 24 24">
          <path d="M7 5l12 7-12 7z"></path>
        </symbol>
        <symbol id="dti-check2" viewBox="0 0 24 24">
          <path d="m5 12.5 4.5 4.5L19 7.5"></path>
        </symbol>
        <symbol id="dti-user" viewBox="0 0 24 24">
          <circle cx="12" cy="8.5" r="3.5"></circle>
          <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"></path>
        </symbol>
        <symbol id="dti-x" viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6 6 18"></path>
        </symbol>
      </defs>
    </svg>
  );
}
