import Image from "next/image";

type MediFoxVariant = "search" | "wellbeing" | "alert" | "empty" | "loading" | "welcome" | "pharmacist-empty";

type MediFoxProps = {
  variant: MediFoxVariant;
  className?: string;
  alt?: string;
};

const illustrationByVariant: Record<MediFoxVariant, string> = {
  search: "11-cropped.png",
  wellbeing: "7-cropped.png",
  alert: "6-cropped.png",
  empty: "13-cropped.png",
  loading: "12-cropped.png",
  welcome: "8-cropped.png",
  "pharmacist-empty": "10-cropped.png",
};

export default function MediFox({ variant, className = "", alt = "" }: MediFoxProps) {
  return (
    <span className={`medi-fox medi-fox--${variant} ${className}`} aria-hidden={alt ? undefined : true}>
      <Image
        src={encodeURI(`/Bộ nhận diện y tế/${illustrationByVariant[variant]}`)}
        alt={alt}
        fill
        sizes="(max-width: 760px) 110px, 180px"
      />
    </span>
  );
}
