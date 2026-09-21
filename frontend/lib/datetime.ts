// Backend lưu thời gian dạng UTC "naive" (datetime.utcnow(), không kèm timezone),
// nên chuỗi ISO trả về không có hậu tố "Z"/offset - nếu đưa thẳng vào `new Date()`,
// trình duyệt sẽ hiểu nhầm đó là giờ local, làm lệch đúng bằng độ lệch múi giờ
// (+7 tiếng ở Việt Nam). Hàm này gắn "Z" khi thiếu, để luôn parse đúng là UTC.
function parseUtcDate(isoString: string): Date {
  const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(isoString);
  return new Date(hasTimezone ? isoString : `${isoString}Z`);
}

export function formatVietnameseDateTime(isoString: string): string {
  return parseUtcDate(isoString).toLocaleString("vi-VN");
}
