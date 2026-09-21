const STICKY_HEADER_SELECTOR = ".patient-header, .pharmacist-nav, .mc-header";
const EXTRA_GAP_PX = 24;

// Cuộn mượt tới `elementId`, chừa đúng chiều cao header sticky (đo trực tiếp
// bằng getBoundingClientRect ngay lúc cuộn) thay vì đoán một con số cố định
// bằng CSS scroll-margin-top - cách cũ từng bị hụt vì không khớp chiều cao
// header thực tế trên trình duyệt người dùng.
export function scrollBelowStickyHeader(elementId: string, behavior: ScrollBehavior = "smooth") {
  const target = document.getElementById(elementId);
  if (!target) return;

  const content = target.closest(".app-content, .pharmacist-content, .mc-page");
  if (content instanceof HTMLElement) {
    const style = window.getComputedStyle(content);
    const isScrollable = /(auto|scroll)/.test(style.overflowY) && content.scrollHeight > content.clientHeight;
    if (isScrollable) {
      const internalHeader = content.querySelector(".mc-header");
      const internalHeaderHeight = internalHeader instanceof HTMLElement ? internalHeader.getBoundingClientRect().height : 0;
      const top = content.scrollTop + target.getBoundingClientRect().top - content.getBoundingClientRect().top - internalHeaderHeight - EXTRA_GAP_PX;
      content.scrollTo({ top: Math.max(top, 0), behavior });
      return;
    }
  }

  const header = document.querySelector(STICKY_HEADER_SELECTOR);
  const headerHeight = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
  const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - EXTRA_GAP_PX;
  window.scrollTo({ top: Math.max(top, 0), behavior });
}
