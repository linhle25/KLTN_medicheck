import MaterialIcon from "@/components/MaterialIcon";
import { ds } from "@/lib/design-system";

export default function Disclaimer() {
  return (
    <p className="disclaimer">
      <MaterialIcon name="info" size={18} />
      <span>{ds.components.disclaimer.text}</span>
    </p>
  );
}
