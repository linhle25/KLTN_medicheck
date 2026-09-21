"use client";

import MaterialIcon from "@/components/MaterialIcon";

export default function EmergencyPage() {
  return <main className="emergency-page">
    <section className="page-intro page-intro--emergency"><MaterialIcon name="warning" size={30} filled /><div><h1>Liên hệ Khẩn cấp</h1><p>Thông tin liên lạc quan trọng trong trường hợp khẩn cấp.</p></div></section>
    <div className="emergency-cards"><article className="emergency-card emergency-card--red"><h2>Cấp cứu (115)</h2><p>Gọi ngay nếu gặp tình trạng nguy hiểm đến tính mạng.</p><a href="tel:115"><MaterialIcon name="call" size={18} /> Gọi 115</a></article><article className="emergency-card emergency-card--blue"><h2>Trung tâm Chống độc</h2><p>Hỗ trợ 24/7 về tương tác thuốc và ngộ độc.</p><a href="tel:19006602"><MaterialIcon name="call" size={18} /> Gọi 1900 6602</a></article></div>
    <section className="contact-list"><h2><MaterialIcon name="contacts" size={22} /> Danh bạ Y tế</h2><article className="contact-row"><span className="contact-avatar"><MaterialIcon name="stethoscope" size={23} /></span><div><strong>BS. Nguyễn Văn A</strong><p>Bác sĩ điều trị chính - Khoa Tim mạch</p></div><div className="contact-row__actions"><a className="contact-message" href="sms:0900000000"><MaterialIcon name="chat_bubble_outline" size={18} /> Nhắn tin</a><a href="tel:0900000000"><MaterialIcon name="call" size={18} /> Gọi điện</a></div></article><article className="contact-row"><span className="contact-avatar contact-avatar--brown"><MaterialIcon name="local_pharmacy" size={23} /></span><div><strong>Nhà thuốc gần nhất</strong><p>Mở cửa 24/7</p></div><div className="contact-row__actions"><a className="contact-message" href="sms:19006602"><MaterialIcon name="chat_bubble_outline" size={18} /> Nhắn tin</a><a href="tel:19006602"><MaterialIcon name="call" size={18} /> Gọi điện</a></div></article></section>
  </main>;
}
