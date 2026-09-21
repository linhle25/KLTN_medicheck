"use client";

import { useState } from "react";

type ExpandableTextProps = {
  text: string;
  maxChars?: number;
  className?: string;
};

// Cắt tại ranh giới từ gần nhất trước maxChars thay vì cắt giữa chừng 1 từ.
function truncateAtWord(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd();
}

// Rút gọn đoạn văn dài (giai_thich do LLM sinh) thành 1 đoạn preview + nút "Xem
// thêm"/"Thu gọn" nội tuyến ngay cuối câu - dùng trong AlertCard để danh sách
// nhiều cặp tương tác (thuốc-thuốc/thực phẩm/bệnh nền) gọn hơn khi lướt nhanh,
// vẫn xem được trọn vẹn ngay tại chỗ khi cần mà không phải đoán trước độ dài.
export default function ExpandableText({ text, maxChars = 170, className }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);

  if (!text || text.length <= maxChars) {
    return <span className={className}>{text}</span>;
  }

  const truncated = truncateAtWord(text, maxChars);

  return (
    <span className={className}>
      {expanded ? text : `${truncated}… `}
      <button
        type="button"
        className="expandable-text__toggle"
        aria-expanded={expanded}
        onClick={(event) => {
          event.stopPropagation();
          setExpanded((value) => !value);
        }}
      >
        {expanded ? "Thu gọn" : "Xem thêm"}
      </button>
    </span>
  );
}
