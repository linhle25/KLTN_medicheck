import Image from "next/image";
import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import MediFox from "@/components/MediFox";
import styles from "./auth-support.module.css";

const asset = (name: string) => encodeURI("/Bộ nhận diện y tế/" + name);

type AuthSupportShellProps = { eyebrow: string; title: string; description: string; icon: string; children: ReactNode };

export function AuthSupportShell({ eyebrow, title, description, icon, children }: AuthSupportShellProps) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.logo} aria-label="MediCheck - Trang chủ">
            <Image src={asset("2-cropped.png")} alt="MediCheck" fill sizes="142px" priority />
          </Link>
          <div className={styles.headerActions}>
            <Link href="/auth" className={styles.backLink}><MaterialIcon name="arrow_back" size={18} />Quay lại đăng nhập</Link>
          </div>
        </header>
        <section className={styles.layout}>
          <div className={styles.intro}>
            <span className={styles.introBadge}><MaterialIcon name="verified_user" size={18} filled />BẢO MẬT TÀI KHOẢN</span>
            <h1>An tâm quay lại với <em>MediCheck.</em></h1>
            <p>Mọi bước xác minh và khôi phục đều được bảo vệ để thông tin sức khỏe của bạn luôn riêng tư.</p>
            <div className={styles.points}>
              <span><MaterialIcon name="lock" size={19} /> Liên kết chỉ sử dụng được một lần</span>
              <span><MaterialIcon name="schedule" size={19} /> Tự động hết hạn để đảm bảo an toàn</span>
            </div>
            <MediFox variant="loading" className={styles.mascot} />
          </div>
          <section className={styles.card}>
            <div className={styles.cardIcon}><MaterialIcon name={icon} size={28} /></div>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h2>{title}</h2>
            <p className={styles.description}>{description}</p>
            {children}
            <div className={styles.secureNote}><MaterialIcon name="shield_lock" size={17} />Kết nối được bảo mật</div>
          </section>
        </section>
      </div>
    </main>
  );
}

type AuthTextFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; icon: string; trailing?: ReactNode; hint?: string };

export function AuthTextField({ label, icon, trailing, hint, id, ...inputProps }: AuthTextFieldProps) {
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <div className={`${styles.inputWrap} icon-input-spacing`}><MaterialIcon name={icon} size={20} /><input id={id} {...inputProps} />{trailing}</div>
    {hint && <small>{hint}</small>}
  </div>;
}

type AuthPrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; icon?: string };

export function AuthPrimaryButton({ loading, icon = "arrow_forward", children, disabled, ...props }: AuthPrimaryButtonProps) {
  return <button className={styles.primaryButton} disabled={disabled || loading} {...props}>
    {loading ? <span className={styles.spinner} aria-hidden="true" /> : <>{children}<MaterialIcon name={icon} size={20} /></>}
  </button>;
}

export function AuthIconButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={styles.iconButton} {...props}>{children}</button>;
}

export function AuthNotice({ tone, children }: { tone: "info" | "success" | "error" | "pending"; children: ReactNode }) {
  return <p className={`${styles.notice} ${styles[tone]}`} role={tone === "error" ? "alert" : "status"} aria-live="polite">
    {children}
  </p>;
}

export function AuthPageFooter({ children = "Quay lại đăng nhập" }: { children?: ReactNode }) {
  return <p className={styles.footer}><Link href="/auth"><MaterialIcon name="arrow_back" size={17} />{children}</Link></p>;
}
