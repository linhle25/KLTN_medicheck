"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  checkGuestProducts,
  checkProducts,
  searchGuestProducts,
  type MedicationCheckResponse,
  type ProductSearchResult,
} from "@/lib/api";
import { getSession, type Session } from "@/lib/auth";
import type { Prescription } from "@/lib/prescription";
import { scrollBelowStickyHeader } from "@/lib/scroll";
import InteractionResultView from "@/components/graph/InteractionResultView";
import ThemeModeToggle from "@/components/ThemeModeToggle";

const asset = (name: string) => encodeURI(`/Bộ nhận diện y tế/${name}`);

const features = [
  {
    icon: "medication",
    title: "Kiểm tra tương tác",
    text: "Phân tích tương tác giữa các loại thuốc bạn đang dùng để giảm rủi ro.",
  },
  {
    icon: "hub",
    title: "Đồ thị tương tác trực quan",
    text: "Mỗi thuốc là một nút, mỗi cặp tương tác là một đường nối tô màu theo mức độ nghiêm trọng.",
  },
  {
    icon: "support_agent",
    title: "Hỗ trợ chuyên gia",
    text: "Kết nối với dược sĩ và bác sĩ để nhận tư vấn chuyên môn đáng tin cậy.",
  },
];

function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const scrollRoot = document.querySelector(".mc-page");
    const updateHeader = () => {
      const scrollTop = scrollRoot instanceof HTMLElement ? scrollRoot.scrollTop : window.scrollY;
      setScrolled(scrollTop > 12);
    };
    updateHeader();
    const eventTarget = scrollRoot instanceof HTMLElement ? scrollRoot : window;
    eventTarget.addEventListener("scroll", updateHeader, { passive: true });
    return () => eventTarget.removeEventListener("scroll", updateHeader);
  }, []);

  return (
    <header
      className={`mc-header mc-shell ${scrolled ? "mc-header--scrolled" : ""}`}
    >
      <Link href="/" className="mc-logo" aria-label="MediCheck">
        <Image
          src={asset("2-cropped.png")}
          alt="MediCheck"
          fill
          sizes="500px"
          priority
        />
      </Link>
      <nav className="mc-nav" aria-label="Điều hướng chính">
        {/* <ThemeModeToggle /> */}
        <a href="#features">Tính năng</a>
        <a href="#about">Về MediCheck</a>
        <Link href="/auth" className="mc-login">
          Đăng nhập
        </Link>
      </nav>
      <Link href="/auth" className="mc-mobile-login">
        Đăng nhập
      </Link>
    </header>
  );
}

type LandingCheck = {
  result: MedicationCheckResponse;
  prescriptions: Prescription[];
  session: Session | null;
};

const LANDING_SEARCH_PLACEHOLDER = "Nhập tên thuốc rồi chọn trong danh sách gợi ý";
const DRUG_CHIP_LABEL_MAX_LENGTH = 30;

function compactDrugChipLabel(name: string): string {
  return name.length > DRUG_CHIP_LABEL_MAX_LENGTH
    ? `${name.slice(0, DRUG_CHIP_LABEL_MAX_LENGTH).trimEnd()}…`
    : name;
}

function HeroDrugSearch({
  onComplete,
}: {
  onComplete: (check: LandingCheck) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const selectedRef = useRef<string[]>([]);
  const [suggestions, setSuggestions] = useState<ProductSearchResult[]>([]);
  const [showLoginToast, setShowLoginToast] = useState(false);
  const [toastLeaving, setToastLeaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState("");

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      setAnimatedPlaceholder(LANDING_SEARCH_PLACEHOLDER);
      return;
    }

    let visibleCharacters = 0;
    let deleting = false;
    let timer: number;
    const animate = () => {
      setAnimatedPlaceholder(LANDING_SEARCH_PLACEHOLDER.slice(0, visibleCharacters));
      let delay = deleting ? 30 : 58;
      if (!deleting && visibleCharacters === LANDING_SEARCH_PLACEHOLDER.length) {
        deleting = true;
        delay = 1500;
      } else if (deleting && visibleCharacters === 0) {
        deleting = false;
        delay = 400;
      } else {
        visibleCharacters += deleting ? -1 : 1;
      }
      timer = window.setTimeout(animate, delay);
    };
    animate();
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const keyword = query.trim();
    if (keyword.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchGuestProducts(keyword)
        .then((results) => {
          if (cancelled) return;
          setSuggestions(results);
          if (results.length === 0) {
            setMessage("Không tìm thấy tên thuốc này. Vui lòng nhập lại và chọn từ danh sách gợi ý.");
            setMessageIsError(true);
          }
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  function triggerLoginToast() {
    setToastLeaving(false);
    setShowLoginToast(true);
  }

  useEffect(() => {
    if (!showLoginToast) return;
    const leaveTimer = window.setTimeout(() => setToastLeaving(true), 1600);
    const removeTimer = window.setTimeout(() => {
      setShowLoginToast(false);
      setToastLeaving(false);
    }, 2000);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
    };
  }, [showLoginToast]);

  function addDrugs(names: string[]) {
    const next = [...selectedRef.current];
    for (const name of names) {
      if (next.some((item) => item.toLowerCase() === name.toLowerCase()))
        continue;
      if (next.length >= 3) {
        triggerLoginToast();
        setMessage("");
        setMessageIsError(false);
        return;
      }
      next.push(name);
    }
    selectedRef.current = next;
    setSelected(next);
    setQuery("");
    setSuggestions([]);
    setMessage("");
    setMessageIsError(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = [...selectedRef.current];

    if (query.trim()) {
      setMessage("Tên thuốc bạn vừa gõ chưa được chọn. Hãy bấm vào đúng thuốc trong danh sách gợi ý.");
      setMessageIsError(true);
      return;
    }
    if (next.length < 2) {
      setMessage("Hãy tìm và chọn ít nhất 2 thuốc từ danh sách gợi ý để kiểm tra tương tác.");
      setMessageIsError(true);
      return;
    }
    const prescription: Prescription = {
      id: `landing-${Date.now()}`,
      label: "Tra cứu nhanh",
      drugs: next.map((name) => ({ name, known: true })),
    };
    const session = getSession();
    setMessage("Đang phân tích tương tác...");
    setMessageIsError(false);
    try {
      const payload = [{ label: prescription.label, products: next }];
      const result = session
        ? await checkProducts(payload, session.accessToken)
        : await checkGuestProducts(payload);
      onComplete({ result, prescriptions: [prescription], session });
      setMessage("");
    } catch {
      setMessage("Không thể phân tích tương tác lúc này. Vui lòng thử lại.");
      setMessageIsError(true);
    }
  }

  return (
    <>
      <form className="mc-search-panel" onSubmit={submit}>
        {selected.length > 0 && (
          <div className="mc-drug-chips" aria-label="Thuốc đã chọn">
            {selected.map((name) => (
              <span key={name} className="mc-drug-chip">
                <span className="mc-drug-chip__name" title={name}>
                  {compactDrugChipLabel(name)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = selectedRef.current.filter(
                      (item) => item !== name,
                    );
                    selectedRef.current = next;
                    setSelected(next);
                  }}
                  aria-label={`Bỏ ${name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mc-search-row">
          <span
            className="material-symbols-outlined mc-search-icon"
            aria-hidden="true"
          >
            search
          </span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setMessage("");
              setMessageIsError(false);
            }}
            aria-label="Tìm và chọn tên thuốc"
            aria-autocomplete="list"
            aria-controls="landing-drug-suggestions"
            aria-expanded={suggestions.length > 0}
            aria-describedby={message ? "landing-drug-search-message" : undefined}
            placeholder={animatedPlaceholder}
          />
          <button type="submit">
            Tra cứu ngay <span aria-hidden="true">→</span>
          </button>
        </div>
        {suggestions.length > 0 && (
          <ul id="landing-drug-suggestions" className="mc-search-suggestions" aria-label="Danh sách thuốc gợi ý">
            {suggestions.slice(0, 5).map((product) => (
              <li key={product.id} className={selected.some((name) => name.toLowerCase() === product.ten_thuoc.toLowerCase()) ? "mc-search-suggestion--selected" : undefined}>
                <button
                  type="button"
                  disabled={selected.some((name) => name.toLowerCase() === product.ten_thuoc.toLowerCase())}
                  onClick={() => addDrugs([product.ten_thuoc])}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {selected.some((name) => name.toLowerCase() === product.ten_thuoc.toLowerCase()) ? "check_circle" : "add_circle"}
                  </span>
                  <b>{product.ten_thuoc}</b>
                  <small>{selected.some((name) => name.toLowerCase() === product.ten_thuoc.toLowerCase()) ? "Đã chọn" : "Chọn"}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
        {message && (
          <p id="landing-drug-search-message" className={`mc-search-message ${messageIsError ? "mc-search-message--error" : ""}`} role={messageIsError ? "alert" : "status"}>
            {message}
          </p>
        )}
        <div className="mc-search-stats" aria-label="Lợi ích của MediCheck">
          <span>
            <i className="material-symbols-outlined" aria-hidden="true">
              medication
            </i>
            10.000+ loại thuốc
          </span>
          <span>
            <i className="material-symbols-outlined" aria-hidden="true">
              health_and_safety
            </i>
            Cảnh báo tương tác thuốc
          </span>
          <span>
            <i className="material-symbols-outlined" aria-hidden="true">
              update
            </i>
            Cập nhật dữ liệu mỗi ngày
          </span>
        </div>
      </form>
      {showLoginToast && (
        <aside
          className={`mc-login-toast${toastLeaving ? " mc-login-toast--leaving" : ""}`}
          role="status"
          aria-live="polite"
        >
          <button
            className="mc-login-toast__close"
            type="button"
            aria-label="Đóng thông báo"
            onClick={() => {
              setShowLoginToast(false);
              setToastLeaving(false);
            }}
          >
            ×
          </button>
          <span className="mc-kicker">MEDICHECK ACCOUNT</span>
          <h2>Cần đăng nhập để kiểm tra nhiều thuốc</h2>
          <p>
            Đăng nhập để tra cứu tương tác với nhiều thuốc hơn và lưu lịch sử
            của bạn.
          </p>
          <Link href="/auth" className="mc-button">
            Đăng nhập để tiếp tục <span aria-hidden="true">↗</span>
          </Link>
        </aside>
      )}
    </>
  );
}

function HeroSection({
  onComplete,
}: {
  onComplete: (check: LandingCheck) => void;
}) {
  return (
    <section
      className="mc-shell mc-hero"
      aria-label="MediCheck - tra cứu tương tác, dùng thuốc an toàn"
    >
      <div className="mc-hero__glow" />
      <Image
        className="mc-hero__capsule"
        src={asset("15.png")}
        alt="Viên nang minh họa MediCheck"
        fill
        priority
        quality={95}
        sizes="(max-width: 760px) 145vw, 125vw"
      />
      <div className="mc-hero__overlay" />
      <div className="mc-hero__caption">
        <span className="mc-kicker">HEALTHCARE INTELLIGENCE / 01</span>
        <h1>
          Tra cứu thuốc
          <br />
          <em>thông minh hơn.</em>
        </h1>
        <p>An toàn hơn trong từng quyết định điều trị.</p>
        <Link href="/auth" className="mc-button">
          Bắt đầu ngay <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <div className="mc-hero__new-copy">
        <h1>
          Tra cứu tương tác
          <br />
          <em>dùng thuốc an toàn</em>
        </h1>
        <p>
          Biến tương tác phức tạp thành phân tích trực quan, đồng hành cùng
          bạn dùng thuốc an toàn.
        </p>
      </div>
      <HeroDrugSearch onComplete={onComplete} />
    </section>
  );
}

function FeatureSection() {
  return (
    <section id="features" className="mc-shell mc-section">
      <div className="mc-section-heading">
        <span className="mc-kicker">01 / CORE SYSTEM</span>
        <h2>
          Công nghệ đứng
          <br />
          <em>về phía sức khỏe.</em>
        </h2>
        <p>
          Một không gian tra cứu trực quan, nơi dữ liệu y tế được biến thành
          những quyết định dễ hiểu và an toàn.
        </p>
      </div>
      <div className="mc-feature-grid">
        {features.map((feature, index) => (
          <article className="mc-glass mc-feature-card" key={feature.title}>
            <span className="mc-index">0{index + 1}</span>
            <span
              className="material-symbols-outlined mc-icon"
              aria-hidden="true"
            >
              {feature.icon}
            </span>
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MissionSection() {
  return (
    <section id="about" className="mc-shell mc-mission">
      <div className="mc-mission__visual">
        <Image
          src={asset("18.png")}
          alt="Minh họa DNA y tế"
          fill
          sizes="520px"
        />
      </div>
      <article className="mc-glass mc-mission__card">
        <span className="mc-kicker">02 / OUR MISSION</span>
        <h2>
          Sức khỏe tốt bắt đầu từ một quyết định <em>đúng.</em>
        </h2>
        <p>
          MediCheck giúp người bệnh và chuyên gia y tế kiểm tra tương tác thuốc
          nhanh chóng, chính xác, góp phần giảm thiểu rủi ro và nâng cao an toàn
          điều trị.
        </p>
        <Link href="/auth" className="mc-text-link">
          Khám phá MediCheck <span>↗</span>
        </Link>
      </article>
    </section>
  );
}

function AudienceSection() {
  return (
    <section id="audience" className="mc-shell mc-audience">
      <div className="mc-audience__intro">
        <span className="mc-kicker">03 / FOR </span>
        <h2>
          Được thiết kế
          <br />
          <em>cho.</em>
        </h2>
      </div>
      <div className="mc-audience-grid">
        <article className="mc-glass mc-audience-card">
          <span className="mc-index">01</span>
          <h3>Bệnh nhân</h3>
          <p>
            Quản lý đơn thuốc, nhận cảnh báo và chủ động hơn trong quá trình
            điều trị tại nhà.
          </p>
        </article>
        <article className="mc-glass mc-audience-card">
          <span className="mc-index">02</span>
          <h3>Dược sĩ / Bác sĩ</h3>
          <p>
            Tra cứu nhanh, dữ liệu tin cậy và công cụ hỗ trợ tư vấn tại phòng
            khám.
          </p>
        </article>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="mc-shell mc-cta">
      <div>
        <span className="mc-kicker">READY WHEN YOU ARE</span>
        <h2>
          Sẵn sàng bảo vệ
          <br />
          <em>sức khỏe của bạn?</em>
        </h2>
      </div>
      <Link href="/auth" className="mc-button">
        Đăng ký ngay <span aria-hidden="true">↗</span>
      </Link>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="mc-footer">
      <div className="mc-shell mc-footer__inner">
        <div className="mc-footer__top">
          <div className="mc-footer__brand">
            <Link href="/" className="mc-footer__logo" aria-label="MediCheck - Trang chủ">
              <Image src={asset("2-cropped.png")} alt="MediCheck" fill sizes="190px" />
            </Link>
            <p>
              Tra cứu tương tác thuốc rõ ràng, có nguồn dữ liệu và luôn đặt an
              toàn của người dùng lên trước.
            </p>
          </div>

          <nav className="mc-footer__nav" aria-label="Điều hướng cuối trang">
            <div>
              <strong>Khám phá</strong>
              <a href="#features">Tính năng</a>
              <a href="#about">Về MediCheck</a>
              <a href="#audience">Dành cho ai</a>
            </div>
            <div>
              <strong>Sử dụng</strong>
              <Link href="/interaction">Kiểm tra tương tác</Link>
              <Link href="/auth">Đăng nhập</Link>
              <Link href="/auth">Tạo tài khoản</Link>
            </div>
          </nav>
        </div>

        <div className="mc-footer__bottom">
          <span>© 2026 MediCheck. Dữ liệu tham chiếu DDInter 2.0.</span>
          <span>
            Thông tin chỉ mang tính tham khảo, không thay thế tư vấn của bác sĩ
            hoặc dược sĩ.
          </span>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  const [landingCheck, setLandingCheck] = useState<LandingCheck | null>(null);

  useEffect(() => {
    if (!landingCheck) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollBelowStickyHeader("landing-interaction-result");
      });
    });
  }, [landingCheck]);

  return (
    <main className="mc-page">
      <style jsx global>{`
        .mc-page {
          --ink: #f5f8ff;
          --muted: #a8b5cc;
          height: 100dvh;
          min-height: 0;
          overflow-x: clip;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          background: #070d18;
          color: var(--ink);
          font-family: Inter, Arial, sans-serif;
        }
        .mc-page * {
          box-sizing: border-box;
        }
        .mc-shell {
          width: min(1240px, calc(100% - 40px));
          margin-inline: auto;
        }
        .mc-header {
          height: 76px;
          padding: 0 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 12px;
          z-index: 50;
          border: 1px solid transparent;
          border-radius: 30px;
          transition:
            background 0.24s ease,
            border-color 0.24s ease,
            box-shadow 0.24s ease,
            backdrop-filter 0.24s ease;
        }
        .mc-header--scrolled {
          border-color: rgba(196, 213, 241, 0.78);
          background: rgba(255, 255, 255, 0.68);
          box-shadow: 0 12px 32px rgba(54, 83, 137, 0.12);
          backdrop-filter: blur(18px) saturate(145%);
          -webkit-backdrop-filter: blur(18px) saturate(145%);
        }
        .mc-logo {
          position: relative;
          width: 180px;
          height: 68px;
          display: block;
        }
        .mc-logo img {
          object-fit: contain;
        }
        .mc-nav {
          display: flex;
          align-items: center;
          gap: 28px;
        }
        .mc-nav a:not(.mc-login) {
          color: #a8b5cc;
          font-size: 15px;
          text-decoration: none;
        }
        .mc-nav a:not(.mc-login):hover {
          color: #fff;
        }
        .mc-login {
          border: 1px solid #516987;
          border-radius: 999px;
          padding: 11px 20px;
          color: #eaf2ff;
          text-decoration: none;
          font-size: 15px;
          background: #ffffff0b;
          backdrop-filter: blur(14px);
        }
        .mc-hero {
          position: relative;
          aspect-ratio: 2400/780;
          min-height: 390px;
          overflow: hidden;
          border: 1px solid #98b8ef45;
          border-radius: 28px;
          box-shadow: 0 24px 80px #0008;
        }
        .mc-hero__design {
          z-index: 0;
          object-fit: cover;
          object-position: center;
        }
        .mc-hero__overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          /* .mc-hero switches to overflow: visible below so .mc-hero__capsule
             can bleed past the card edge - this fills the same box and needs
             its own radius or its flat corners show through unclipped. */
          border-radius: 28px;
          background: linear-gradient(
            90deg,
            #07111acc 0%,
            #07111a22 43%,
            transparent 70%
          );
        }
        .mc-hero__glow {
          position: absolute;
          z-index: 2;
          width: 35%;
          height: 50%;
          left: 8%;
          top: 20%;
          background: #6d9dff3d;
          filter: blur(70px);
        }
        .mc-hero__caption {
          position: absolute;
          z-index: 3;
          left: 6%;
          bottom: 13%;
          max-width: 300px;
        }
        .mc-kicker {
          display: block;
          color: #9bbdff;
          font-size: 10px;
          letter-spacing: 0.2em;
          font-weight: 700;
        }
        .mc-hero__caption p {
          font-size: clamp(18px, 2.2vw, 28px);
          line-height: 1.25;
          margin: 13px 0 20px;
        }
        .mc-button {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          border: 1px solid #ffffff55;
          border-radius: 999px;
          padding: 13px 20px;
          background: #ffffff15;
          color: #fff;
          text-decoration: none;
          font-size: 12px;
          font-weight: 700;
          backdrop-filter: blur(16px);
          box-shadow: 0 10px 26px #0004;
          transition: 0.25s;
        }
        .mc-button:hover {
          transform: translateY(-3px);
          background: #fff;
          color: #172a4b;
        }
        .mc-hero__meta {
          position: absolute;
          z-index: 3;
          right: 4%;
          bottom: 7%;
          display: flex;
          gap: 20px;
          color: #dce9ffbb;
          font-size: 10px;
          letter-spacing: 0.16em;
        }
        .mc-section {
          padding: 130px 0 80px;
        }
        .mc-section-heading {
          display: grid;
          grid-template-columns: 1fr 1.3fr 1fr;
          align-items: end;
          gap: 28px;
          margin-bottom: 42px;
        }
        .mc-section-heading h2,
        .mc-audience h2 {
          font-size: clamp(32px, 5vw, 66px);
          line-height: 0.98;
          margin: 0;
          font-weight: 500;
          letter-spacing: -0.05em;
        }
        .mc-section-heading h2 em,
        .mc-audience h2 em,
        .mc-mission h2 em,
        .mc-cta h2 em {
          color: #82adff;
          font-style: normal;
        }
        .mc-section-heading p {
          color: var(--muted);
          font-size: 13px;
          line-height: 1.7;
          margin: 0;
          max-width: 280px;
        }
        .mc-feature-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
        }
        .mc-glass {
          border: 1px solid #a9c5ee25;
          background: linear-gradient(135deg, #ffffff12, #ffffff04);
          box-shadow:
            inset 0 1px #ffffff1c,
            0 20px 45px #0002;
          backdrop-filter: blur(18px);
        }
        .mc-feature-card {
          position: relative;
          min-height: 235px;
          padding: 27px;
          border-radius: 18px;
        }
        .mc-index {
          color: #8295b5;
          font-size: 10px;
          letter-spacing: 0.15em;
        }
        .mc-icon {
          display: block;
          margin: 35px 0 18px;
          color: #8eb6ff;
          font-size: 28px;
        }
        .mc-feature-card h3 {
          font-size: 17px;
          margin: 0 0 8px;
        }
        .mc-feature-card p,
        .mc-audience-card p {
          color: var(--muted);
          font-size: 12px;
          line-height: 1.7;
          margin: 0;
        }
        .mc-mission {
          position: relative;
          min-height: 540px;
          padding: 85px 0;
        }
        .mc-mission__visual {
          position: absolute;
          right: -5%;
          top: 0;
          width: 55%;
          height: 100%;
          opacity: 0.72;
        }
        .mc-mission__visual img {
          object-fit: contain;
        }
        .mc-mission__visual span {
          position: absolute;
          right: 15%;
          bottom: 15%;
          color: #9bbdff99;
          font-size: 10px;
          letter-spacing: 0.2em;
        }
        .mc-mission__card {
          position: relative;
          width: min(610px, 65%);
          padding: 48px;
          border-radius: 22px;
        }
        .mc-mission h2 {
          font-size: clamp(30px, 4vw, 54px);
          line-height: 1.02;
          letter-spacing: -0.045em;
          font-weight: 500;
          margin: 18px 0;
        }
        .mc-mission p {
          color: var(--muted);
          font-size: 13px;
          line-height: 1.8;
          max-width: 450px;
        }
        .mc-text-link {
          display: inline-flex;
          gap: 12px;
          margin-top: 24px;
          color: #c7dbff;
          text-decoration: none;
          font-size: 12px;
          font-weight: 700;
        }
        .mc-audience {
          display: grid;
          grid-template-columns: 0.8fr 1.2fr;
          gap: 70px;
          padding: 100px 0;
        }
        .mc-audience-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
        }
        .mc-audience-card {
          position: relative;
          min-height: 300px;
          padding: 26px;
          border-radius: 18px;
          overflow: hidden;
        }
        .mc-audience-card img {
          position: absolute;
          right: -42px;
          top: -32px;
          width: 190px;
          height: 190px;
          object-fit: contain;
          opacity: 0.72;
        }
        .mc-audience-card h3 {
          font-size: 20px;
          margin: 105px 0 10px;
        }
        .mc-cta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 25px;
          padding: 50px 58px;
          margin-bottom: 50px;
          border: 1px solid #96baff35;
          border-radius: 22px;
          background: linear-gradient(110deg, #162b4d, #0b1629);
        }
        .mc-cta h2 {
          font-size: clamp(30px, 4vw, 52px);
          line-height: 1;
          margin: 15px 0 0;
          font-weight: 500;
          letter-spacing: -0.05em;
        }
        .mc-cta .mc-button {
          background: #dceaff;
          color: #162d57;
          border-color: transparent;
        }
        .mc-cta .mc-button:hover {
          background: #fff;
          color: #162d57;
        }
        .mc-footer {
          margin-top: 38px;
          border-top: 1px solid #c7d8ef;
          background:
            radial-gradient(circle at 12% 0%, #aacbff4d, transparent 300px),
            linear-gradient(180deg, #f3f8ff, #eaf2fd);
        }
        .mc-footer__inner {
          padding: 52px 0 28px;
        }
        .mc-footer__top {
          display: grid;
          grid-template-columns: minmax(260px, 1.35fr) minmax(360px, 1fr);
          gap: 72px;
          align-items: start;
        }
        .mc-footer__logo {
          position: relative;
          display: block;
          width: 190px;
          height: 58px;
        }
        .mc-footer__logo img {
          object-fit: contain;
          object-position: left center;
        }
        .mc-footer__brand p {
          max-width: 460px;
          margin: 18px 0 0;
          color: #5d6f88;
          font-size: 14px;
          line-height: 1.7;
        }
        .mc-footer__nav {
          display: grid;
          grid-template-columns: repeat(2, minmax(140px, 1fr));
          gap: 36px;
        }
        .mc-footer__nav > div {
          display: grid;
          align-content: start;
          gap: 12px;
        }
        .mc-footer__nav strong {
          margin-bottom: 4px;
          color: #132a4d;
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .mc-footer__nav a {
          width: fit-content;
          color: #5d6f88;
          font-size: 14px;
          text-decoration: none;
          transition: color 0.18s ease, transform 0.18s ease;
        }
        .mc-footer__nav a:hover,
        .mc-footer__nav a:focus-visible {
          color: #315da1;
          transform: translateX(3px);
        }
        .mc-footer__bottom {
          display: flex;
          justify-content: space-between;
          gap: 30px;
          margin-top: 42px;
          padding-top: 22px;
          border-top: 1px solid #c7d8ef;
          color: #667892;
          font-size: 12px;
          line-height: 1.55;
        }
        .mc-footer__bottom span:last-child {
          max-width: 520px;
          text-align: right;
        }
        html[data-theme="dark"] .mc-footer {
          border-top-color: #334b6a;
          background:
            radial-gradient(circle at 12% 0%, #4167b21f, transparent 300px),
            linear-gradient(180deg, #0b1629, #070d18);
        }
        html[data-theme="dark"] .mc-footer__brand p,
        html[data-theme="dark"] .mc-footer__nav a {
          color: #a8b5cc;
        }
        html[data-theme="dark"] .mc-footer__nav strong {
          color: #f5f8ff;
        }
        html[data-theme="dark"] .mc-footer__nav a:hover,
        html[data-theme="dark"] .mc-footer__nav a:focus-visible {
          color: #82adff;
        }
        html[data-theme="dark"] .mc-footer__bottom {
          border-top-color: #263a57;
          color: #899ab4;
        }
        @media (max-width: 760px) {
          .mc-shell {
            width: min(100% - 24px, 1240px);
          }
          .mc-header {
            height: 64px;
            top: 8px;
            padding: 0 14px;
            border-radius: 24px;
          }
          .mc-logo {
            width: 120px;
          }
          .mc-nav {
            gap: 10px;
          }
          .mc-nav a:not(.mc-login) {
            display: none;
          }
          .mc-hero {
            aspect-ratio: 1/1;
            min-height: 500px;
          }
          .mc-hero__design {
            object-position: 58% center;
          }
          .mc-hero__overlay {
            background: linear-gradient(0deg, #07111acc 0%, transparent 65%);
          }
          .mc-hero__caption {
            left: 8%;
            bottom: 13%;
          }
          .mc-section {
            padding: 90px 0 50px;
          }
          .mc-section-heading,
          .mc-audience {
            display: block;
          }
          .mc-section-heading h2 {
            margin: 18px 0;
          }
          .mc-section-heading p {
            max-width: 100%;
            margin-bottom: 30px;
          }
          .mc-feature-grid,
          .mc-audience-grid {
            grid-template-columns: 1fr;
          }
          .mc-mission {
            min-height: 600px;
            padding-top: 280px;
          }
          .mc-mission__visual {
            width: 100%;
            height: 370px;
            right: 0;
            top: 0;
          }
          .mc-mission__card {
            width: 100%;
            padding: 30px 24px;
          }
          .mc-audience-grid {
            margin-top: 30px;
          }
          .mc-cta {
            display: block;
            padding: 34px 26px;
          }
          .mc-cta .mc-button {
            margin-top: 26px;
          }
          .mc-footer {
            margin-top: 24px;
          }
          .mc-footer__inner {
            padding: 38px 0 24px;
          }
          .mc-footer__top {
            grid-template-columns: 1fr;
            gap: 34px;
          }
          .mc-footer__logo {
            width: 164px;
            height: 50px;
          }
          .mc-footer__nav {
            gap: 24px;
          }
          .mc-footer__bottom {
            align-items: flex-start;
            flex-direction: column;
            gap: 10px;
            margin-top: 34px;
          }
          .mc-footer__bottom span:last-child {
            text-align: left;
          }
        }
        .mc-logo {
          width: 190px;
          height: 68px;
        }
        .mc-logo img {
          transform: scale(1.55);
        }
        .mc-hero {
          aspect-ratio: 2.65 / 1;
          min-height: 430px;
        }
        .mc-hero__capsule {
          width: 78%;
          height: 158%;
          left: 26%;
          top: -28%;
          object-position: center;
          transform: rotate(-2deg) scale(1.7);
          transform-origin: 62% 50%;
        }
        .mc-hero__caption {
          left: 7%;
          top: 20%;
          bottom: auto;
          max-width: 430px;
        }
        .mc-hero__caption h1 {
          font-size: clamp(46px, 6vw, 82px);
          margin: 22px 0 15px;
        }
        .mc-hero__caption p {
          font-size: clamp(17px, 2vw, 23px);
          line-height: 1.35;
          max-width: 300px;
          margin: 0 0 26px;
        }
        .mc-hero__meta {
          right: 5%;
          bottom: 8%;
        }
        @media (max-width: 760px) {
          .mc-logo {
            width: 148px;
            height: 56px;
          }
          .mc-logo img {
            transform: scale(1.45);
          }
          .mc-hero {
            aspect-ratio: 1 / 1;
            min-height: 540px;
          }
          .mc-hero__capsule {
            width: 125%;
            height: 86%;
            left: -6%;
            top: -5%;
            object-position: center;
            transform: rotate(-4deg) scale(1.4);
            transform-origin: 50% 42%;
          }
          .mc-hero__caption {
            left: 8%;
            top: auto;
            bottom: 11%;
            max-width: 330px;
          }
          .mc-hero__caption h1 {
            font-size: 48px;
          }
          .mc-hero__caption p {
            font-size: 17px;
          }
        }
        .mc-audience {
          gap: 46px;
          padding-top: 65px;
          padding-bottom: 65px;
        }
        .mc-audience-grid {
          gap: 12px;
        }
        .mc-audience-card {
          min-height: 235px;
          padding: 22px;
        }
        .mc-audience-card img {
          width: 135px;
          height: 135px;
          right: -24px;
          top: -20px;
        }
        .mc-audience-card h3 {
          margin: 72px 0 8px;
          font-size: 18px;
        }
        .mc-mission__visual {
          right: -19%;
          top: -24%;
          width: 76%;
          height: 155%;
          opacity: 0.62;
          z-index: 0;
        }
        .mc-mission__visual img {
          object-fit: contain;
          object-position: center;
        }
        .mc-mission__visual span {
          right: 20%;
          bottom: 18%;
        }
        .mc-mission__card {
          z-index: 2;
        }
        .mc-hero {
          overflow: visible;
        }
        .mc-hero__capsule {
          width: 82%;
          height: 170%;
          left: 25%;
          top: -34%;
          transform: rotate(-2deg) scale(1.9);
          transform-origin: 62% 50%;
        }
        @media (max-width: 760px) {
          .mc-audience {
            padding-top: 55px;
            padding-bottom: 55px;
          }
          .mc-audience-card {
            min-height: 220px;
          }
          .mc-mission__visual {
            right: -28%;
            top: -12%;
            width: 125%;
            height: 92%;
          }
          .mc-mission__visual span {
            right: 22%;
            bottom: 10%;
          }
          .mc-hero {
            overflow: visible;
          }
          .mc-hero__capsule {
            width: 130%;
            height: 92%;
            left: -8%;
            top: -10%;
            transform: rotate(-4deg) scale(1.5);
            transform-origin: 50% 42%;
          }
        }
        .mc-logo {
          width: 158px;
          height: 50px;
        }
        .mc-logo img {
          transform: none;
        }
        .mc-login {
          transition:
            background 0.2s ease,
            border-color 0.2s ease,
            color 0.2s ease,
            box-shadow 0.2s ease,
            transform 0.2s ease;
        }
        .mc-login:hover,
        .mc-login:focus-visible {
          background: #eaf2ff;
          border-color: #7da4e8;
          color: #244b8d;
          box-shadow: 0 8px 20px #4167b226;
          transform: translateY(-2px);
        }
        .mc-hero {
          overflow: visible;
        }
        .mc-hero__capsule {
          width: 96%;
          height: 205%;
          left: 19%;
          top: -48%;
          transform: rotate(-2deg) scale(2.05);
          transform-origin: 62% 50%;
        }
        @media (max-width: 760px) {
          .mc-logo {
            width: 132px;
            height: 42px;
          }
          .mc-logo img {
            transform: none;
          }
          .mc-hero__capsule {
            width: 145%;
            height: 108%;
            left: -14%;
            top: -18%;
            transform: rotate(-4deg) scale(1.65);
          }
        }
        .mc-search-panel {
          position: absolute;
          z-index: 4;
          left: 5%;
          right: 5%;
          bottom: 22px;
        }
        .mc-search-row {
          display: flex;
          align-items: center;
          gap: 14px;
          min-height: 58px;
          padding: 7px 9px 7px 18px;
          border: 1px solid #d3e0f2;
          border-radius: 999px;
          background: #fffffff2;
          box-shadow: 0 14px 30px #355b951c;
          backdrop-filter: blur(16px);
        }
        .mc-search-icon {
          color: #7184a2;
          font-size: 27px;
        }
        .mc-search-row input {
          min-width: 0;
          flex: 1;
          border: 0;
          outline: 0;
          background: transparent;
          color: #172b49;
          font: inherit;
          font-size: 15px;
        }
        .mc-search-row input::placeholder {
          color: #8b9ab3;
        }
        .mc-search-row button {
          border: 0;
          border-radius: 999px;
          padding: 13px 25px;
          background: linear-gradient(100deg, #8daaf0, #4167b2);
          color: #fff;
          cursor: pointer;
          font: inherit;
          font-size: 14px;
          font-weight: 800;
          white-space: nowrap;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
        }
        .mc-search-row button:hover,
        .mc-search-row button:focus-visible {
          transform: translateY(-2px);
          box-shadow: 0 8px 18px #4167b244;
        }
        .mc-search-stats {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          padding: 13px 8px 0;
          color: #4167b2;
          font-size: 12px;
        }
        .mc-search-stats span {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .mc-search-stats b {
          color: #6f92df;
          font-size: 20px;
        }
        @media (max-width: 760px) {
          .mc-search-panel {
            left: 5%;
            right: 5%;
            bottom: 18px;
          }
          .mc-search-row {
            gap: 7px;
            min-height: 48px;
            padding-left: 12px;
          }
          .mc-search-icon {
            font-size: 22px;
          }
          .mc-search-row input {
            font-size: 11px;
          }
          .mc-search-row button {
            padding: 10px 13px;
            font-size: 11px;
          }
          .mc-search-stats {
            display: none;
          }
        }
        .mc-hero__caption {
          display: none !important;
        }
        .mc-hero__new-copy {
          position: absolute;
          z-index: 4;
          left: 5%;
          top: 17%;
          width: 58%;
          max-width: 760px;
        }
        .mc-hero__badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 16px;
          border: 1px solid #a9c2e8;
          border-radius: 999px;
          background: #edf4ff;
          color: #4167b2;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }
        .mc-hero__badge span {
          display: grid;
          place-items: center;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #4167b2;
          color: #fff;
          font-size: 13px;
        }
        .mc-hero__new-copy h1 {
          margin: 25px 0 14px;
          color: #132a4d;
          font-size: clamp(42px, 5.4vw, 76px);
          line-height: 0.98;
          letter-spacing: -0.055em;
          font-weight: 600;
        }
        .mc-hero__new-copy h1 em {
          color: #4167b2;
          font-style: normal;
        }
        .mc-hero__new-copy p {
          max-width: 710px;
          margin: 0;
          color: #5d6f88;
          font-size: clamp(15px, 1.8vw, 22px);
          line-height: 1.45;
        }
        .mc-search-panel {
          left: 5%;
          right: auto;
          width: 60%;
          bottom: 8%;
        }
        .mc-search-stats {
          font-size: 11px;
        }
        .mc-search-stats span {
          white-space: nowrap;
        }
        @media (max-width: 760px) {
          .mc-hero__new-copy {
            left: 8%;
            top: 12%;
            width: 84%;
          }
          .mc-hero__badge {
            font-size: 8px;
            padding: 7px 11px;
          }
          .mc-hero__new-copy h1 {
            margin: 18px 0 10px;
            font-size: 39px;
          }
          .mc-hero__new-copy p {
            font-size: 14px;
          }
          .mc-search-panel {
            left: 5%;
            right: 5%;
            width: auto;
            bottom: 7%;
          }
          .mc-search-stats {
            display: none;
          }
        }
        .mc-hero {
          min-height: 560px;
        }
        .mc-hero__new-copy {
          top: 21%;
          width: 54%;
          max-width: 700px;
        }
        .mc-hero__new-copy h1 {
          font-size: clamp(40px, 4.6vw, 66px);
          line-height: 1.02;
          margin: 22px 0 14px;
        }
        .mc-hero__new-copy p {
          max-width: 620px;
          font-size: clamp(15px, 1.45vw, 19px);
          line-height: 1.45;
        }
        .mc-hero__capsule {
          width: 65%;
          height: 182%;
          right: 27.4%;
          top: -39%;
          transform: rotate(-2deg) scale(1.8);
          transform-origin: 62% 50%;
        }
        .mc-search-panel {
          left: 5%;
          width: 58%;
          bottom: 5%;
        }
        .mc-search-row {
          min-height: 54px;
        }
        .mc-search-stats {
          padding-top: 9px;
          font-size: 10px;
        }
        .mc-search-stats b {
          font-size: 17px;
        }
        @media (max-width: 760px) {
          .mc-hero {
            min-height: 560px;
          }
          .mc-hero__new-copy {
            top: 11%;
            width: 84%;
          }
          .mc-hero__new-copy h1 {
            font-size: 39px;
          }
          .mc-hero__new-copy p {
            font-size: 14px;
          }
          .mc-hero__capsule {
            width: 135%;
            height: 96%;
            left: -8%;
            top: -13%;
            transform: rotate(-4deg) scale(1.5);
          }
          .mc-search-panel {
            left: 5%;
            right: 5%;
            width: auto;
            bottom: 6%;
          }
        }
        .mc-hero__capsule {
          transform: translateX(220px) rotate(-2deg) scale(1.78);
          transform-origin: 62% 50%;
        }
        .mc-search-panel {
          bottom: 11% !important;
        }
        .mc-feature-card {
          min-height: 285px;
          padding: 30px;
        }
        .mc-feature-card .mc-icon {
          margin: 38px 0 22px;
          font-size: 38px;
        }
        .mc-feature-card h3 {
          margin: 0 0 12px;
          font-size: 21px;
        }
        .mc-feature-card p {
          font-size: 15px;
          line-height: 1.75;
        }
        .mc-feature-card .mc-index {
          font-size: 12px;
        }
        .mc-audience-card {
          min-height: 275px;
          padding: 30px;
        }
        .mc-audience-card .mc-index {
          font-size: 12px;
        }
        .mc-audience-card h3 {
          margin: 74px 0 13px;
          font-size: 24px;
        }
        .mc-audience-card p {
          font-size: 15px;
          line-height: 1.75;
        }
        .mc-audience-card img {
          width: 155px;
          height: 155px;
          right: -18px;
          top: -25px;
        }
        /* Transparent glass panels for the landing surfaces. */
        .mc-header,
        .mc-search-panel,
        .mc-glass,
        .mc-feature-card,
        .mc-audience-card,
        .mc-mission__card,
        .mc-cta {
          border: 1px solid rgba(255, 255, 255, 0.52);
          background: rgba(255, 255, 255, 0.28);
          box-shadow: inset 0 1px rgba(255, 255, 255, 0.62), 0 18px 44px rgba(44, 71, 112, 0.12);
          backdrop-filter: blur(22px) saturate(135%);
          -webkit-backdrop-filter: blur(22px) saturate(135%);
        }
        .mc-search-row {
          border-color: rgba(183, 204, 237, 0.72);
          background: rgba(255, 255, 255, 0.48);
          backdrop-filter: blur(16px) saturate(130%);
          -webkit-backdrop-filter: blur(16px) saturate(130%);
        }
        .mc-search-panel {
          border-color: transparent;
          background: transparent;
          box-shadow: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }
        .mc-header { background: rgba(255, 255, 255, 0.2); }
        .mc-nav {
          gap: 2px;
          padding: 5px 5px 5px 17px;
          border: 1px solid rgba(255, 255, 255, 0.38);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.18);
          box-shadow: inset 0 1px rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(14px) saturate(130%);
          -webkit-backdrop-filter: blur(14px) saturate(130%);
        }
        .mc-nav a:not(.mc-login) {
          position: relative;
          display: inline-flex;
          align-items: center;
          min-height: 38px;
          padding: 8px 12px;
          border-radius: 999px;
          color: #536887;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.01em;
          transition: color 180ms ease, background 180ms ease, transform 180ms ease;
        }
        .mc-nav a:not(.mc-login)::after {
          content: "";
          position: absolute;
          right: 16px;
          bottom: 5px;
          left: 16px;
          height: 2px;
          border-radius: 999px;
          background: #5575c4;
          opacity: 0;
          transform: scaleX(0.45);
          transition: opacity 180ms ease, transform 180ms ease;
        }
        .mc-nav a:not(.mc-login):hover,
        .mc-nav a:not(.mc-login):focus-visible {
          color: #294b8c;
          background: rgba(255, 255, 255, 0.62);
          outline: none;
          transform: translateY(-1px);
        }
        .mc-nav a:not(.mc-login):hover::after,
        .mc-nav a:not(.mc-login):focus-visible::after {
          opacity: 1;
          transform: scaleX(1);
        }
        html[data-theme="dark"] .mc-nav {
          border-color: rgba(155, 184, 228, 0.28);
          background: rgba(13, 28, 49, 0.34);
        }
        html[data-theme="dark"] .mc-nav a:not(.mc-login) {
          color: #b9c9e2;
        }
        html[data-theme="dark"] .mc-nav a:not(.mc-login):hover,
        html[data-theme="dark"] .mc-nav a:not(.mc-login):focus-visible {
          color: #fff;
          background: rgba(79, 111, 186, 0.3);
        }
        html[data-theme="dark"] .mc-header,
        html[data-theme="dark"] .mc-search-panel,
        html[data-theme="dark"] .mc-glass,
        html[data-theme="dark"] .mc-feature-card,
        html[data-theme="dark"] .mc-audience-card,
        html[data-theme="dark"] .mc-mission__card,
        html[data-theme="dark"] .mc-cta {
          border-color: rgba(155, 184, 228, 0.28);
          background: rgba(13, 28, 49, 0.38);
          box-shadow: inset 0 1px rgba(255, 255, 255, 0.1), 0 18px 44px rgba(0, 0, 0, 0.2);
        }
        html[data-theme="dark"] .mc-search-row {
          border-color: rgba(155, 184, 228, 0.32);
          background: rgba(10, 24, 43, 0.46);
        }
        .mc-search-row input,
        .mc-search-row input:focus {
          border: 0 !important;
          outline: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        html[data-theme="dark"] .mc-search-row input,
        html[data-theme="dark"] .mc-search-row input:focus {
          border: 0 !important;
          background: transparent !important;
          color: #edf4ff;
          box-shadow: none !important;
        }
        html[data-theme="dark"] .mc-search-row input::placeholder {
          color: #9db0cf;
          opacity: 1;
        }
        html[data-theme="dark"] .mc-search-panel {
          border-color: transparent;
          background: transparent;
          box-shadow: none;
        }

        @media (max-width: 760px) {
          .mc-hero__capsule {
            transform: translateX(0) rotate(-4deg) scale(1.5);
          }
          .mc-search-panel {
            bottom: 9% !important;
          }
          .mc-feature-card {
            min-height: 245px;
            padding: 26px;
          }
          .mc-feature-card .mc-icon {
            margin: 30px 0 18px;
            font-size: 34px;
          }
          .mc-feature-card h3 {
            font-size: 19px;
          }
          .mc-feature-card p {
            font-size: 14px;
          }
          .mc-audience-card {
            min-height: 240px;
            padding: 25px;
          }
          .mc-audience-card h3 {
            margin-top: 66px;
            font-size: 21px;
          }
          .mc-audience-card p {
            font-size: 14px;
          }
        }
        .mc-search-panel {
          z-index: 8;
        }
        .mc-search-stats {
          display: flex;
          align-items: center;
          gap: 0;
          margin: 12px 4px 0;
          color: #4167b2;
        }
        .mc-search-stats span {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 0 16px;
          border-right: 1px solid #cbdaf1;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
        }
        .mc-search-stats span:first-child {
          padding-left: 0;
        }
        .mc-search-stats span:last-child {
          border-right: 0;
        }
        .mc-search-stats i {
          font-size: 18px;
          color: #5b7bd0;
          font-style: normal;
        }
        .mc-drug-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
          margin: 0 0 10px;
        }
        .mc-drug-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          max-width: 100%;
          padding: 9px 12px;
          border: 1px solid #bfd0ed;
          border-radius: 12px;
          background: #fff;
          color: #1d3763;
          font-size: 13px;
          font-weight: 700;
          box-shadow: 0 8px 18px #385b8b18;
        }
        .mc-drug-chip button {
          display: grid;
          place-items: center;
          width: 20px;
          height: 20px;
          padding: 0;
          border: 1px solid #8ba6d2;
          border-radius: 50%;
          background: transparent;
          color: #4167b2;
          cursor: pointer;
          font-size: 17px;
          line-height: 1;
        }
        .mc-search-suggestions {
          position: absolute;
          z-index: 10;
          left: 0;
          right: 0;
          bottom: calc(100% - 10px);
          max-height: 190px;
          margin: 0;
          padding: 8px;
          overflow: auto;
          border: 1px solid #c7d8ef;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 16px 32px #243e6b28;
          list-style: none;
        }
        .mc-search-suggestions li + li {
          border-top: 1px solid #edf2fa;
        }
        .mc-search-suggestions button {
          display: grid;
          grid-template-columns: 22px minmax(0, 1fr) auto;
          align-items: center;
          gap: 9px;
          width: 100%;
          padding: 11px 13px;
          border: 0;
          background: transparent;
          color: #1f385f;
          cursor: pointer;
          text-align: left;
          font: inherit;
          font-size: 13px;
        }
        .mc-search-suggestions button > .material-symbols-outlined {
          color: #5276bd;
          font-size: 20px;
        }
        .mc-search-suggestions button > b {
          min-width: 0;
          overflow: hidden;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .mc-search-suggestions button > small {
          color: #5574ad;
          font-size: 11px;
          font-weight: 750;
        }
        .mc-search-suggestions button:hover {
          background: #eef5ff;
        }
        .mc-search-suggestions {
          bottom: calc(100% + 12px);
          max-height: 176px;
          padding: 6px;
          border: 1px solid rgba(173, 198, 235, 0.88);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.82);
          box-shadow: 0 18px 38px rgba(36, 62, 107, 0.16), inset 0 1px rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(20px) saturate(135%);
          -webkit-backdrop-filter: blur(20px) saturate(135%);
          scrollbar-width: thin;
          scrollbar-color: #9aabd0 transparent;
        }
        .mc-search-suggestions::-webkit-scrollbar { width: 7px; }
        .mc-search-suggestions::-webkit-scrollbar-track { background: transparent; }
        .mc-search-suggestions::-webkit-scrollbar-thumb {
          border: 2px solid transparent;
          border-radius: 999px;
          background: #9aabd0;
          background-clip: padding-box;
        }
        .mc-search-suggestions li + li { border-top-color: rgba(207, 220, 241, 0.65); }
        .mc-search-suggestions button {
          min-height: 42px;
          border-radius: 12px;
          color: #263e6d;
        }
        .mc-search-suggestions button:hover,
        .mc-search-suggestions button:focus-visible {
          background: rgba(220, 233, 255, 0.78);
          color: #263e6d !important;
          outline: none;
        }
        .mc-search-suggestion--selected button {
          color: #8798b8 !important;
          background: rgba(230, 237, 248, 0.62);
          cursor: not-allowed;
        }
        .mc-search-suggestion--selected small {
          margin-left: 12px;
          color: #7085aa;
          font-size: 11px;
          font-weight: 700;
        }
        html[data-theme="dark"] .mc-search-suggestions {
          border-color: rgba(104, 139, 195, 0.58);
          background: rgba(17, 34, 57, 0.9);
          box-shadow: 0 18px 38px rgba(0, 0, 0, 0.28);
          scrollbar-color: #5f7fae transparent;
        }
        html[data-theme="dark"] .mc-search-suggestions li + li { border-top-color: rgba(91, 119, 160, 0.36); }
        html[data-theme="dark"] .mc-search-suggestions button { color: #e6efff; }
        html[data-theme="dark"] .mc-search-suggestions button:hover,
        html[data-theme="dark"] .mc-search-suggestions button:focus-visible {
          background: rgba(68, 101, 157, 0.45);
          color: #e6efff !important;
        }
        html[data-theme="dark"] .mc-search-suggestion--selected button {
          color: #8298ba !important;
          background: rgba(49, 72, 108, 0.6);
        }
        html[data-theme="dark"] .mc-search-suggestion--selected small { color: #9bb0d0; }
        .mc-search-message {
          margin: 8px 4px 0;
          color: #54709d;
          font-size: 11px;
          line-height: 1.4;
        }
        .mc-search-message--error {
          color: #b14455;
          font-weight: 700;
        }
        .mc-login-modal {
          position: fixed;
          z-index: 30;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 20px;
        }
        .mc-login-modal__backdrop {
          position: absolute;
          inset: 0;
          border: 0;
          background: #0a1a36a8;
          backdrop-filter: blur(5px);
          cursor: pointer;
        }
        .mc-login-modal__content {
          position: relative;
          width: min(440px, 100%);
          padding: 34px;
          border: 1px solid #d0def2;
          border-radius: 24px;
          background: #fff;
          box-shadow: 0 24px 70px #091b3b4d;
        }
        .mc-login-modal__content h2 {
          margin: 16px 0 10px;
          color: #132a4d;
          font-size: 28px;
          line-height: 1.15;
        }
        .mc-login-modal__content p {
          margin: 0 0 24px;
          color: #5d6f88;
          line-height: 1.6;
        }
        .mc-login-modal__close {
          position: absolute;
          top: 12px;
          right: 14px;
          width: 32px;
          height: 32px;
          border: 0;
          border-radius: 50%;
          background: #edf4ff;
          color: #315da1;
          cursor: pointer;
          font-size: 24px;
          line-height: 1;
        }
        @media (max-width: 760px) {
          .mc-search-stats {
            flex-wrap: wrap;
            gap: 7px;
            margin-top: 9px;
          }
          .mc-search-stats span {
            padding: 0;
            border: 0;
            font-size: 10px;
          }
          .mc-search-stats i {
            font-size: 15px;
          }
          .mc-drug-chip {
            font-size: 11px;
            padding: 7px 9px;
          }
          .mc-search-suggestions {
            bottom: calc(100% + 6px);
          }
          .mc-login-modal__content {
            padding: 28px 24px;
          }
        }
        .mc-result-shell {
          padding: 70px 0 48px;
        }
        .mc-result-shell__header {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 28px;
        }
        .mc-result-shell__header h2 {
          margin: 10px 0 0;
          color: #132a4d;
          font-size: clamp(28px, 4vw, 46px);
          letter-spacing: -0.04em;
        }
        .mc-result-shell__close {
          padding: 11px 17px;
          border: 1px solid #b8cae6;
          border-radius: 999px;
          background: #fff;
          color: #315da1;
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
        }
        .mc-result-shell__close:hover {
          background: #edf4ff;
        }
        @media (max-width: 760px) {
          .mc-result-shell {
            padding-top: 45px;
          }
          .mc-result-shell__header {
            align-items: start;
            flex-direction: column;
          }
          .mc-result-shell__header h2 {
            font-size: 30px;
          }
        }
        .mc-result-shell__close {
          position: fixed !important;
          right: 24px;
          bottom: 24px;
          z-index: 1000 !important;
          pointer-events: auto !important;
          box-shadow: 0 12px 28px #274d872b;
        }
        .mc-drug-chips {
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          gap: 9px;
          width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .mc-drug-chips::-webkit-scrollbar {
          display: none;
        }
        .mc-drug-chip {
          min-width: 0;
          width: fit-content;
          max-width: 100%;
          flex: 0 0 auto;
          min-height: 0 !important;
          height: 52px !important;
          display: inline-flex;
          align-self: center;
          align-items: center;
          gap: 7px;
          padding: 8px 12px;
          line-height: 1.25;
          overflow: hidden;
        }
        .mc-drug-chip__name {
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1 1 auto;
        }
        .mc-drug-chip button {
          width: auto;
          height: auto;
          padding: 0;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          color: #4167b2;
          font-size: 21px;
          font-weight: 500;
          line-height: 1;
          flex: 0 0 auto;
          appearance: none;
          outline: 0;
          box-shadow: none;
        }
        .mc-drug-chip button:hover {
          color: #173f82;
          background: transparent !important;
          border: 0 !important;
          box-shadow: none;
        }
        .mc-login-toast {
          position: fixed;
          z-index: 2000;
          top: 100px;
          right: 24px;
          width: min(390px, calc(100vw - 32px));
          padding: 25px 28px;
          border: 1px solid #c6d8f3;
          border-radius: 20px;
          background: #fff;
          box-shadow: 0 22px 55px #17346436;
          animation: mc-toast-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        .mc-login-toast h2 {
          margin: 13px 0 8px;
          color: #132a4d;
          font-size: 23px;
          line-height: 1.2;
        }
        .mc-login-toast p {
          margin: 0 0 19px;
          color: #5d6f88;
          font-size: 14px;
          line-height: 1.55;
        }
        .mc-login-toast__close {
          position: absolute;
          right: 10px;
          top: 10px;
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 50%;
          background: #edf4ff;
          color: #315da1;
          cursor: pointer;
          font-size: 22px;
          line-height: 1;
        }
        @keyframes mc-toast-in {
          from {
            transform: translateX(calc(100% + 32px));
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @media (max-width: 760px) {
          .mc-result-shell__close {
            right: 16px;
            bottom: 16px;
            width: auto !important;
          }
          .mc-drug-chips {
            gap: 6px;
          }
          .mc-drug-chip {
            gap: 4px;
          }
          .mc-drug-chip button {
            font-size: 18px;
          }
          .mc-login-toast {
            top: 84px;
            right: 16px;
          }
        }
        @keyframes mc-toast-out {
          from {
            transform: translateY(0);
            opacity: 1;
          }
          to {
            transform: translateY(36px);
            opacity: 0;
          }
        }
        .mc-login-toast--leaving {
          animation: mc-toast-out 0.4s cubic-bezier(0.4, 0, 1, 1) both;
          pointer-events: none;
        }

        /* Living capsule: subtle floating motion keeps the hero active without
           competing with the search interaction. */
        .mc-hero__capsule {
          animation:
            mc-capsule-float 7s ease-in-out infinite,
            mc-capsule-glow 4.5s ease-in-out infinite;
          backface-visibility: hidden;
          image-rendering: auto;
          will-change: transform, filter;
        }

        @keyframes mc-capsule-float {
          0%, 100% {
            transform: translate3d(220px, 0, 0) rotate(-2deg) scale(1.78);
          }
          50% {
            transform: translate3d(228px, -18px, 0) rotate(1deg) scale(1.82);
          }
        }

        @keyframes mc-capsule-glow {
          0%, 100% {
            filter: drop-shadow(0 18px 24px rgba(39, 96, 183, 0.16));
          }
          50% {
            filter: drop-shadow(0 26px 34px rgba(39, 96, 183, 0.28));
          }
        }

        @media (max-width: 760px) {
          .mc-hero__capsule {
            animation:
              mc-capsule-float-mobile 6.5s ease-in-out infinite,
              mc-capsule-glow 4.5s ease-in-out infinite;
          }

          @keyframes mc-capsule-float-mobile {
            0%, 100% {
              transform: translate3d(0, 0, 0) rotate(-4deg) scale(1.5);
            }
            50% {
              transform: translate3d(5px, -10px, 0) rotate(-1deg) scale(1.53);
            }
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .mc-hero__capsule {
            animation: none;
          }
        }
      `}</style>
      <style jsx global>{`
        .mc-page {
          --ink: #132a4d;
          --muted: #5d6f88;
          background: #f7faff;
          color: var(--ink);
        }
        .mc-nav a:not(.mc-login) {
          color: #65758c;
        }
        .mc-nav a:not(.mc-login):hover {
          color: #193e77;
        }
        .mc-login {
          border-color: #b7cceb;
          color: #204779;
          background: #ffffffaa;
        }
        .mc-mobile-login {
          display: none;
        }
        .mc-hero {
          background: #fff;
          border-color: #d7e4f7;
          box-shadow: 0 24px 70px #385b8b1c;
        }
        .mc-hero__capsule {
          z-index: 0;
          object-fit: contain;
          object-position: 72% center;
        }
        .mc-hero__overlay {
          background: linear-gradient(
            90deg,
            #ffffff 0%,
            #ffffffea 34%,
            #ffffff18 68%,
            transparent 100%
          );
        }
        .mc-hero__glow {
          background: #aacbff55;
        }
        .mc-hero__caption {
          color: #132a4d;
        }
        .mc-hero__caption h1 {
          font-size: clamp(34px, 5vw, 70px);
          line-height: 0.98;
          letter-spacing: -0.055em;
          font-weight: 500;
          margin: 18px 0;
        }
        .mc-hero__caption h1 em {
          color: #4167b2;
          font-style: normal;
        }
        .mc-hero__caption p {
          color: #5d6f88;
          font-size: 15px;
        }
        .mc-kicker {
          color: #4167b2;
        }
        .mc-button {
          background: #4167b2;
          color: #fff;
          border-color: #4167b2;
        }
        .mc-button:hover {
          background: #244b8d;
          color: #fff;
        }
        .mc-hero__meta {
          color: #4167b2aa;
        }
        .mc-glass {
          border-color: #c7d8ef;
          background: linear-gradient(135deg, #ffffffd9, #eef5ffb8);
          box-shadow:
            inset 0 1px #fff,
            0 20px 45px #52749e18;
        }
        .mc-icon {
          color: #4167b2;
        }
        .mc-feature-card p,
        .mc-audience-card p,
        .mc-section-heading p,
        .mc-mission p {
          color: #5d6f88;
        }
        .mc-index {
          color: #7790b0;
        }
        .mc-mission__visual {
          opacity: 0.55;
        }
        .mc-mission__visual span {
          color: #4167b299;
        }
        .mc-text-link {
          color: #315da1;
        }
        .mc-cta {
          border-color: #c2d5f1;
          background: linear-gradient(110deg, #e9f3ff, #fff);
        }
        .mc-cta .mc-button {
          background: #4167b2;
          color: #fff;
        }

        @media (max-width: 760px) {
          .mc-page {
            height: 100svh;
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
            scrollbar-gutter: auto;
          }
          .mc-shell {
            width: calc(100% - 24px);
          }
          .mc-header,
          .mc-header.mc-shell {
            width: calc(100% - 12px);
            height: 64px;
            min-height: 64px;
            margin: 6px auto 0;
            padding: 6px 8px;
            top: 6px;
            gap: 4px;
            border: 1px solid rgba(183, 204, 237, 0.72);
            border-radius: 22px;
            background: rgba(255, 255, 255, 0.48) !important;
            box-shadow: 0 8px 24px rgba(45, 77, 124, 0.1) !important;
            backdrop-filter: blur(18px) saturate(140%);
            -webkit-backdrop-filter: blur(18px) saturate(140%);
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          html[data-theme="dark"] .mc-header,
          html[data-theme="dark"] .mc-header.mc-shell {
            border-color: rgba(91, 119, 160, 0.58);
            background: rgba(13, 28, 49, 0.48) !important;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18) !important;
          }
          .mc-logo {
            flex: 0 1 clamp(62px, 20vw, 88px);
            width: clamp(62px, 20vw, 88px);
            height: 42px;
            min-width: 0;
          }
          .mc-nav {
            position: static;
            flex: 1 1 auto;
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: clamp(1px, 0.8vw, 5px);
            height: auto;
            padding: 0;
            border: 0;
            border-radius: 999px;
            background: transparent !important;
            box-shadow: none;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
          html[data-theme="dark"] .mc-header .mc-nav {
            border-color: transparent;
            background: transparent !important;
            box-shadow: none;
          }
          .mc-nav a:not(.mc-login) {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 34px;
            padding: 4px clamp(2px, 1vw, 6px);
            font-size: clamp(9px, 2.7vw, 12px);
            white-space: nowrap;
          }
          .mc-nav .mc-login {
            display: inline-flex !important;
            flex: 0 0 auto;
            width: auto !important;
            height: 34px !important;
            min-height: 34px;
            padding: 5px clamp(6px, 2vw, 10px);
            font-size: clamp(9px, 2.7vw, 12px);
          }
          .mc-header .theme-toggle {
            display: inline-flex !important;
            flex: 0 0 clamp(38px, 11vw, 48px);
            width: clamp(38px, 11vw, 48px);
            height: 24px;
          }
          .mc-header .theme-toggle__thumb {
            top: 2px;
            left: 2px;
            width: 20px;
            height: 20px;
          }
          .mc-header .theme-toggle--dark .theme-toggle__thumb {
            transform: translateX(calc(clamp(38px, 11vw, 48px) - 24px));
          }
          .mc-mobile-login {
            display: none;
          }
          html[data-theme="dark"] .mc-mobile-login {
            border-color: #4d71a5;
            background: #1b3152;
            color: #e7f0ff;
          }
          .mc-hero,
          .mc-hero.mc-shell {
            display: flex;
            flex-direction: column;
            width: auto !important;
            min-height: 0;
            height: auto;
            aspect-ratio: auto !important;
            margin: 12px !important;
            padding: 30px 18px 20px;
            overflow: hidden;
            border-radius: 26px;
            max-width: none;
            box-sizing: border-box;
          }
          .mc-hero__new-copy {
            position: relative;
            z-index: 4;
            top: auto;
            left: auto;
            width: 100%;
            max-width: none;
          }
          .mc-hero__new-copy h1 {
            margin: 0 0 12px;
            font-size: clamp(32px, 9.2vw, 38px);
            line-height: 1.06;
            letter-spacing: -0.045em;
            overflow-wrap: normal;
            word-break: normal;
          }
          .mc-hero__new-copy p {
            max-width: 34rem;
            font-size: 13px;
            line-height: 1.5;
          }
          .mc-hero__capsule {
            width: 76%;
            height: 240px;
            top: 174px;
            right: auto;
            left: 12%;
            object-position: center;
            opacity: 0.48;
            animation: none !important;
            transform: none !important;
            will-change: auto;
          }
          .mc-hero__overlay {
            background: linear-gradient(
              0deg,
              #ffffff 0%,
              #fffffff2 34%,
              #ffffff38 72%,
              #ffffffb8 100%
            );
          }
          html[data-theme="dark"] .mc-hero__overlay {
            background: linear-gradient(
              0deg,
              #0d1c31 0%,
              #0d1c31ee 34%,
              #0d1c3144 72%,
              #0d1c31c7 100%
            );
          }
          .mc-search-panel {
            position: static !important;
            z-index: 8;
            top: auto;
            right: auto;
            bottom: auto !important;
            left: auto;
            width: 100%;
            max-width: 100%;
            margin-top: 154px;
          }
          .mc-search-row {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr);
            gap: 5px 9px;
            min-height: 0;
            width: 100%;
            max-width: 100%;
            padding: 8px;
            overflow: hidden;
            border-radius: 20px;
            box-sizing: border-box;
            box-shadow: 0 12px 30px rgba(39, 73, 126, 0.1);
          }
          .mc-search-icon {
            align-self: center;
            margin-left: 4px;
            font-size: 24px;
          }
          .mc-search-row input {
            width: 100%;
            min-height: 42px;
            padding: 0;
            font-size: 14px;
            text-overflow: ellipsis;
          }
          .mc-search-row button {
            grid-column: 1 / -1;
            width: 100%;
            max-width: 100%;
            min-width: 0;
            min-height: 44px;
            padding: 10px 18px;
            font-size: 13px;
            box-sizing: border-box;
            justify-self: stretch;
          }
          .mc-search-stats {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            margin: 12px 0 0;
            padding: 0;
          }
          .mc-search-stats span {
            min-width: 0;
            min-height: 58px;
            width: 100%;
            padding: 6px 3px;
            border: 0;
            border-radius: 0;
            background: transparent;
            flex-direction: column;
            justify-content: flex-start;
            gap: 5px;
            font-size: 9.5px;
            line-height: 1.25;
            text-align: center;
            white-space: normal;
            box-sizing: border-box;
          }
          .mc-search-stats i {
            flex: 0 0 auto;
            font-size: 19px;
          }
          html[data-theme="dark"] .mc-search-stats,
          html[data-theme="dark"] .mc-search-stats span,
          html[data-theme="dark"] .mc-search-stats i {
            color: #91b4ff;
          }
          html[data-theme="dark"] .mc-search-stats span {
            border-color: transparent;
            background: transparent;
          }
          .mc-search-suggestions {
            position: static;
            width: 100%;
            margin-top: 8px;
            max-height: 220px;
          }
          .mc-drug-chips {
            display: flex;
            flex-wrap: nowrap;
          }
          .mc-drug-chip {
            height: 44px !important;
          }
          .mc-section {
            padding-top: 64px;
            padding-bottom: 64px;
          }
          .mc-section-heading,
          .mc-section-heading p,
          .mc-mission,
          .mc-feature-grid,
          .mc-audience-grid {
            width: 100%;
            max-width: 100%;
            min-width: 0;
          }
          .mc-feature-grid,
          .mc-audience-grid {
            grid-template-columns: minmax(0, 1fr);
          }
          .mc-feature-card,
          .mc-audience-card,
          .mc-mission__card {
            min-width: 0;
          }
          .mc-section-heading h2,
          .mc-mission h2,
          .mc-cta h2 {
            font-size: clamp(30px, 9vw, 40px);
            line-height: 1.08;
            overflow-wrap: normal;
            word-break: normal;
          }
        }
      `}</style>
      <Header />
      <HeroSection onComplete={setLandingCheck} />
      {landingCheck ? (
        <section id="landing-interaction-result" className="mc-result-shell mc-shell">
          <div className="mc-result-shell__header">
            <div>
              <span className="mc-kicker">KẾT QUẢ TRA CỨU</span>
              <h2>Phân tích tương tác thuốc</h2>
            </div>
            <button
              type="button"
              className="mc-result-shell__close"
              onClick={() => {
                setLandingCheck(null);
                const landingPage = document.querySelector(".mc-page");
                if (landingPage instanceof HTMLElement) landingPage.scrollTo({ top: 0, behavior: "smooth" });
                else window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Quay lại trang giới thiệu
            </button>
          </div>
          <InteractionResultView
            result={landingCheck.result}
            prescriptions={landingCheck.prescriptions}
            session={landingCheck.session}
            requireLoginToReview={!landingCheck.session}
            showReviewAction={false}
          />
        </section>
      ) : (
        <>
          <FeatureSection />
          <MissionSection />
          <AudienceSection />
          <CTASection />
        </>
      )}
      <LandingFooter />
    </main>
  );
}
