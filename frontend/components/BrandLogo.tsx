import Image from "next/image";
import { brand } from "@/lib/design-system";

type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  className?: string;
};

export default function BrandLogo({ size = "md", showTagline = false, className = "" }: BrandLogoProps) {
  const logoWidth = size === "lg" ? 220 : size === "sm" ? 200 : 180;
  return (
    <div className={`brand-logo brand-logo--${size} ${className}`}>
      <Image
        className="brand-logo__image"
        src={encodeURI("/Bộ nhận diện y tế/2-cropped.png")}
        alt={brand.productName}
        width={logoWidth}
        height={Math.round(logoWidth * 0.278)}
        priority={size !== "sm"}
      />
      {showTagline && (
        <div className="brand-logo__text">
          <span className="brand-logo__tagline">{brand.tagline}</span>
        </div>
      )}
    </div>
  );
}
