"""SQLAlchemy models — khớp Data Model đã thiết kế ở Giai đoạn 2 (mục 5)."""
import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=_uuid)
    ho_ten = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    email_normalized = Column(String(255), unique=True, nullable=False)
    email_verified_at = Column(DateTime, nullable=True)
    mat_khau_hash = Column(String(255), nullable=True)
    vai_tro = Column(String(20), nullable=False)  # patient | pharmacist | admin
    account_status = Column(String(30), nullable=False, default="pending_email")
    # legacy_migration: tài khoản cũ được phép phục hồi khi liên kết Google.
    # admin/security: không được tự mở khóa qua bất kỳ luồng đăng nhập nào.
    lock_source = Column(String(30), nullable=True)
    so_chung_chi_hanh_nghe = Column(String(100), nullable=True)
    ly_do_tu_choi = Column(Text, nullable=True)
    noi_cong_tac = Column(String(255), nullable=True)
    # Mô tả ngắn của dược sĩ (bio) - hiện ở khung chọn dược sĩ khi bệnh nhân nhờ xác
    # nhận, tự cập nhật qua tab "Hồ sơ cá nhân" bên luồng dược sĩ.
    mo_ta_ngan = Column(Text, nullable=True)
    ngay_tao = Column(DateTime, default=datetime.utcnow)


class AuthIdentity(Base):
    __tablename__ = "auth_identities"
    __table_args__ = (
        UniqueConstraint("provider", "subject", name="uq_auth_identity_provider_subject"),
    )
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    provider = Column(String(30), nullable=False)
    subject = Column(String(255), nullable=False)
    ngay_tao = Column(DateTime, default=datetime.utcnow)


class AuthActionToken(Base):
    __tablename__ = "auth_action_tokens"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    purpose = Column(String(30), nullable=False)
    token_hash = Column(String(64), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    ngay_tao = Column(DateTime, default=datetime.utcnow)


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    token_hash = Column(String(64), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    replaced_by_id = Column(String, nullable=True)
    ngay_tao = Column(DateTime, default=datetime.utcnow)


class AuthEvent(Base):
    __tablename__ = "auth_events"
    id = Column(String, primary_key=True, default=_uuid)
    action = Column(String(40), nullable=False)
    key_hash = Column(String(64), nullable=False)
    succeeded = Column(Boolean, default=False, nullable=False)
    ngay_tao = Column(DateTime, default=datetime.utcnow, nullable=False)
    __table_args__ = (Index("idx_auth_events_action_key_time", "action", "key_hash", "ngay_tao"),)


class FeedbackReport(Base):
    __tablename__ = "feedback_reports"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    category = Column(String(30), nullable=False, default="other")
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(30), nullable=False, default="new")
    resolution_note = Column(Text, nullable=True)
    ngay_tao = Column(DateTime, default=datetime.utcnow, nullable=False)
    ngay_cap_nhat = Column(DateTime, default=datetime.utcnow, nullable=False)


class PatientProfile(Base):
    __tablename__ = "patient_profiles"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    ngay_sinh = Column(Date)
    gioi_tinh = Column(String(20))
    can_nang = Column(Float)
    chieu_cao = Column(Float)
    benh_nen_ghi_chu = Column(Text)
    di_ung_thuoc = Column(Text)
    tinh_trang_khac = Column(Text)


class Disease(Base):
    """Danh mục bệnh nền chuẩn hóa dùng để gắn với hồ sơ bệnh nhân."""

    __tablename__ = "diseases"
    id = Column(Integer, primary_key=True, autoincrement=True)
    ten_benh = Column(String(255), unique=True, nullable=False)
    ten_benh_vi = Column(String(255), nullable=True)


class PatientCondition(Base):
    """Quan hệ nhiều-nhiều giữa hồ sơ bệnh nhân và danh mục bệnh nền."""

    __tablename__ = "patient_conditions"
    __table_args__ = (
        UniqueConstraint("patient_profile_id", "disease_id", name="uq_patient_disease"),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_profile_id = Column(String, ForeignKey("patient_profiles.id"), nullable=False)
    disease_id = Column(Integer, ForeignKey("diseases.id"), nullable=False)



class Medication(Base):
    __tablename__ = "medications"
    id = Column(String, primary_key=True, default=_uuid)
    ten_chuan_hoa = Column(String(255), nullable=False)
    ten_biet_duoc = Column(String(255))
    hoat_chat = Column(String(255))
    nguon_du_lieu = Column(String(100))
    mo_ta = Column(Text)  # DDInter Description


class MedicationAlias(Base):
    """Bảng alias/viết tắt thủ công — DDInter không có cột alias riêng.

    Trỏ thẳng vào medication_id thật thay vì tên tự do, để drug_normalizer_tool
    không phải suy đoán ngoài CSDL.
    """

    __tablename__ = "medication_aliases"
    id = Column(String, primary_key=True, default=_uuid)
    alias = Column(String(255), unique=True, nullable=False)
    medication_id = Column(String, ForeignKey("medications.id"), nullable=False)


class Product(Base):
    """Thuốc theo tên biệt dược (VD: Panadol) — crawl từ CSDL thuốc/hoạt chất Việt Nam.

    Khác Medication (hoạt chất chuẩn DDInter): 1 Product có thể gồm nhiều hoạt chất
    (thuốc phối hợp) qua bảng ProductIngredient, nên không dùng chung 1 bảng.
    """

    __tablename__ = "products"
    id = Column(String, primary_key=True, default=_uuid)
    ten_thuoc = Column(String(500), nullable=False)
    is_duoc_lieu = Column(Boolean, default=False)
    loai = Column(String(50))  # ke_don | khong_ke_don
    nguon_du_lieu = Column(String(100))


class ProductIngredient(Base):
    """Thành phần hoạt chất của 1 Product.

    medication_id NULL khi ten_hoat_chat_clean không so khớp chính xác được với
    Medication.ten_chuan_hoa nào trong CSDL DDInter (VD: dược liệu/cao thuốc không có
    trong DDInter) — vẫn lưu để hiển thị thành phần, nhưng KHÔNG dùng để tra tương tác.
    """

    __tablename__ = "product_ingredients"
    id = Column(String, primary_key=True, default=_uuid)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    ten_hoat_chat_raw = Column(Text)
    ten_hoat_chat_clean = Column(String(500))
    medication_id = Column(String, ForeignKey("medications.id"), nullable=True)


class PatientPrescription(Base):
    """1 đơn thuốc đã lưu trong hồ sơ bệnh nhân (tab "Đơn thuốc của tôi") - gộp nhóm
    các PatientMedication lại theo label do bệnh nhân tự đặt, tương tự khái niệm
    "Đơn thuốc N" ở bàn cân tương tác nhưng có lưu persist lại DB."""

    __tablename__ = "patient_prescriptions"
    id = Column(String, primary_key=True, default=_uuid)
    patient_id = Column(String, ForeignKey("users.id"), index=True)
    label = Column(String(100), nullable=False)
    ngay_tao = Column(DateTime, default=datetime.utcnow)


class PatientMedication(Base):
    __tablename__ = "patient_medications"
    id = Column(String, primary_key=True, default=_uuid)
    patient_id = Column(String, ForeignKey("users.id"), index=True)
    # Nullable ở DB (bảng cũ tạo trước khi có khái niệm đơn thuốc, xem
    # src/db/session.py::_ensure_prescription_id_column) nhưng route
    # add_patient_medication luôn gán 1 đơn cụ thể - không có bản ghi "mồ côi" mới.
    prescription_id = Column(String, ForeignKey("patient_prescriptions.id"), nullable=True)
    medication_id = Column(String, ForeignKey("medications.id"), nullable=True)
    product_id = Column(String, ForeignKey("products.id"), nullable=True)
    ngay_bat_dau = Column(Date)
    ngay_ket_thuc = Column(Date)


class Interaction(Base):
    __tablename__ = "interactions"
    __table_args__ = (
        UniqueConstraint("medication_a_id", "medication_b_id", name="uq_interaction_pair"),
    )
    id = Column(String, primary_key=True, default=_uuid)
    # Quy ước bắt buộc khi ghi/đọc: medication_a_id < medication_b_id (so sánh chuỗi)
    # để mỗi cặp thuốc chỉ có đúng 1 bản ghi, tránh phải OR 2 chiều khi tra cứu.
    medication_a_id = Column(String, ForeignKey("medications.id"), nullable=False)
    medication_b_id = Column(String, ForeignKey("medications.id"), nullable=False)
    muc_do = Column(String(20))  # nhe | trung_binh | nang | chua_phan_loai
    mo_ta = Column(Text)
    xu_tri = Column(Text)  # DDInter Management — CHỈ hiển thị cho vai trò dược sĩ
    # Bản dịch tiếng Việt nguyên văn của mo_ta/xu_tri - chỉ ~3000 tổ hợp (mo_ta, xu_tri)
    # khác nhau trong toàn CSDL (nhiều cặp thuốc dùng chung 1 mẫu mô tả DDInter) nên
    # dịch 1 lần qua scripts/translate_interaction_texts.py, lưu lại thay vì gọi LLM
    # dịch lại mỗi lần sinh giải thích (xem explain_node.py). NULL nếu script chưa
    # chạy qua dòng này.
    mo_ta_dich = Column(Text, nullable=True)
    xu_tri_dich = Column(Text, nullable=True)
    nguon_trich_dan = Column(Text)
    thay_the_a = Column(Text)  # DDInter Alt_for_A — tham khảo cho dược sĩ, KHÔNG dùng để agent tự đề xuất đổi thuốc
    thay_the_b = Column(Text)  # DDInter Alt_for_B


class FoodInteraction(Base):
    """Tương tác thuốc-thực phẩm (DDInter 2.0 DFI) - khoá theo 1 hoạt chất, KHÔNG
    phải cặp 2 thuốc như Interaction ở trên."""

    __tablename__ = "food_interactions"
    __table_args__ = (
        UniqueConstraint("medication_id", "thuc_pham", name="uq_food_interaction"),
    )
    id = Column(String, primary_key=True, default=_uuid)
    medication_id = Column(String, ForeignKey("medications.id"), nullable=False)
    thuc_pham = Column(String(255), nullable=False)  # DDInter food_name (tiếng Anh gốc)
    # Bản dịch tiếng Việt của thuc_pham - chỉ 29 tên khác nhau trong toàn CSDL nên
    # dịch 1 lần qua script (scripts/translate_food_disease_names.py), lưu lại thay
    # vì dịch lại mỗi lần sinh giải thích. NULL nếu script chưa chạy qua dòng này.
    thuc_pham_vi = Column(String(255), nullable=True)
    muc_do = Column(String(20))  # nhe | trung_binh | nang | chua_phan_loai
    mo_ta = Column(Text)  # DDInter interaction
    xu_tri = Column(Text)  # DDInter management — CHỈ hiển thị cho vai trò dược sĩ
    # Bản dịch tiếng Việt nguyên văn của mo_ta/xu_tri - cùng cơ chế dịch 1 lần + cache
    # như Interaction.mo_ta_dich (xem scripts/translate_food_disease_texts.py). NULL
    # nếu script chưa chạy qua dòng này.
    mo_ta_dich = Column(Text, nullable=True)
    xu_tri_dich = Column(Text, nullable=True)
    nguon_trich_dan = Column(Text)


class DiseaseInteraction(Base):
    """Tương tác thuốc-bệnh nền (DDInter 2.0 DDSI) - khoá theo 1 hoạt chất. Không có
    cột xu_tri: nguồn DDInter cho DDSI không có trường management."""

    __tablename__ = "disease_interactions"
    __table_args__ = (
        UniqueConstraint("medication_id", "ten_benh", name="uq_disease_interaction"),
        Index("idx_disease_interactions_disease_id", "disease_id"),
        Index("idx_disease_interactions_medication_disease", "medication_id", "disease_id"),
    )
    id = Column(String, primary_key=True, default=_uuid)
    medication_id = Column(String, ForeignKey("medications.id"), nullable=False)
    # Nullable trong schema hiện tại để migration/import dữ liệu cũ có thể chạy theo 2 bước:
    # tạo disease -> backfill mapping -> kiểm tra hết NULL rồi mới cân nhắc siết NOT NULL.
    disease_id = Column(Integer, ForeignKey("diseases.id"), nullable=True)
    ten_benh = Column(String(255), nullable=False)  # DDInter disease_name (tiếng Anh gốc)
    # Bản dịch tiếng Việt của ten_benh - 450 tên khác nhau, cùng cơ chế dịch 1 lần
    # như thuc_pham_vi ở FoodInteraction phía trên.
    ten_benh_vi = Column(String(255), nullable=True)
    muc_do = Column(String(20))
    mo_ta = Column(Text)  # DDInter interaction
    # Bản dịch tiếng Việt nguyên văn của mo_ta - không có xu_tri_dich vì DDSI không
    # có trường management (xem docstring class). Cùng cơ chế cache như Interaction.mo_ta_dich.
    mo_ta_dich = Column(Text, nullable=True)
    nguon_trich_dan = Column(Text)


class InteractionCheck(Base):
    __tablename__ = "interaction_checks"
    id = Column(String, primary_key=True, default=_uuid)
    patient_id = Column(String, ForeignKey("users.id"), index=True)
    ket_qua_json = Column(JSON)
    # Cờ trích từ ket_qua_json (has_severe/has_unclassified) — cột riêng để
    # truy vấn/lọc hàng đợi ưu tiên dược sĩ mà không cần parse JSON mỗi lần.
    co_canh_bao_nang = Column(Boolean, default=False)
    co_chua_phan_loai = Column(Boolean, default=False)
    # Cache tên thuốc trích sẵn từ ket_qua_json lúc TẠO check (xem
    # _checked_drug_names) - để list_patient_checks (trang "Lịch sử") không phải
    # SELECT cột ket_qua_json chỉ để lấy vài tên thuốc hiển thị. ket_qua_json thực
    # đo trung bình ~260KB/dòng (chứa explanations, overview, disease_interactions...)
    # - tải cả cột đó cho MỖI dòng trong danh sách là nguyên nhân chính khiến trang
    # Lịch sử/Trang chủ chậm trên Neon, nặng hơn cả N+1 query đã sửa trước đó.
    thuoc_da_kiem_tra = Column(JSON, nullable=True)
    thoi_gian_kiem_tra = Column(DateTime, default=datetime.utcnow)


class PharmacistLookup(Base):
    """Lịch sử tra cứu nội bộ của dược sĩ (công cụ /pharmacist-lookup) - tách khỏi
    InteractionCheck vì bảng đó gắn với patient_id và các join PharmacistReview/
    trang_thai_xac_nhan chỉ có ý nghĩa cho check của bệnh nhân. ket_qua_json ở đây
    LUÔN chứa các field chỉ-dành-cho-dược-sĩ (giai_thich_duoc_si, xu_tri...) vì
    route tạo ra nó không strip như route của bệnh nhân/khách."""

    __tablename__ = "pharmacist_lookups"
    id = Column(String, primary_key=True, default=_uuid)
    pharmacist_id = Column(String, ForeignKey("users.id"), index=True)
    ket_qua_json = Column(JSON)
    co_canh_bao_nang = Column(Boolean, default=False)
    co_chua_phan_loai = Column(Boolean, default=False)
    thuoc_da_kiem_tra = Column(JSON, nullable=True)
    thoi_gian_kiem_tra = Column(DateTime, default=datetime.utcnow)


class PharmacistReview(Base):
    __tablename__ = "pharmacist_reviews"
    id = Column(String, primary_key=True, default=_uuid)
    interaction_check_id = Column(String, ForeignKey("interaction_checks.id"), index=True)
    pharmacist_id = Column(String, ForeignKey("users.id"), index=True)
    ghi_chu = Column(Text)
    trang_thai_xac_nhan = Column(String(20), default="chua_xac_nhan")
    # true nếu bệnh nhân chọn gửi kèm hồ sơ cá nhân CỦA CHÍNH MÌNH (PatientProfile,
    # đọc trực tiếp lúc dược sĩ xem, không snapshot) - loại trừ lẫn nhau với 3 field
    # nhập tay bên dưới (trường hợp tra cứu hộ người khác không có hồ sơ trong hệ thống).
    gui_kem_ho_so = Column(Boolean, default=False)
    ten_nguoi_duoc_kiem_tra = Column(String(255), nullable=True)
    ngay_sinh_nhap_tay = Column(Date, nullable=True)
    ghi_chu_nhap_tay = Column(Text, nullable=True)
    # Câu hỏi bệnh nhân nhập kèm lúc gửi yêu cầu (không bắt buộc) và câu trả lời
    # tương ứng dược sĩ nhập lúc xác nhận - tách riêng khỏi ghi_chu (nhận xét chung
    # của dược sĩ, có thể không trả lời trực tiếp câu hỏi cụ thể nào).
    cau_hoi = Column(Text, nullable=True)
    cau_tra_loi = Column(Text, nullable=True)
    # Mốc dược sĩ bấm xác nhận - dùng để sắp xếp/tạo thông báo (InteractionCheck chỉ
    # có thời điểm TẠO lần kiểm tra, không phải thời điểm xác nhận).
    thoi_gian_xac_nhan = Column(DateTime, nullable=True)


class Notification(Base):
    """Thông báo 1 chiều cho bệnh nhân - hiện tại chỉ tạo khi dược sĩ xác nhận xong
    1 yêu cầu xét duyệt (xem submit_pharmacist_review)."""

    __tablename__ = "notifications"
    id = Column(String, primary_key=True, default=_uuid)
    patient_id = Column(String, ForeignKey("users.id"), index=True)
    pharmacist_review_id = Column(String, ForeignKey("pharmacist_reviews.id"), nullable=True)
    noi_dung = Column(Text, nullable=False)
    da_doc = Column(Boolean, default=False)
    thoi_gian_tao = Column(DateTime, default=datetime.utcnow)


class ProductExplanationCache(Base):
    """Cache giải thích cấp thuốc-thuốc (rollup_explain.py::_explain_product_edge) -
    dữ liệu DDInter đứng sau 1 cặp thuốc cố định nên nhiều user tra trùng cặp phổ
    biến sẽ dùng lại đúng 1 bản ghi thay vì gọi LLM lại từ đầu. product_a/product_b
    LUÔN lowercase + sort (product_a <= product_b) để không phân biệt thứ tự nhập
    hay hoa/thường - xem src/services/explanation_cache.py."""

    __tablename__ = "product_explanation_cache"
    __table_args__ = (
        UniqueConstraint(
            "product_a", "product_b", "muc_do", "audience", name="uq_product_explanation_cache"
        ),
    )
    id = Column(String, primary_key=True, default=_uuid)
    product_a = Column(String(255), nullable=False)
    product_b = Column(String(255), nullable=False)
    muc_do = Column(String(20), nullable=False)
    audience = Column(String(20), nullable=False)
    giai_thich = Column(Text, nullable=False)
    giai_thich_duoc_si = Column(Text, nullable=True)
    nguon_trich_dan = Column(Text)
    mo_ta_dich = Column(Text, nullable=True)
    xu_tri_dich = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FoodDiseaseExplanationCache(Base):
    """Cache giải thích cấp thuốc-thực phẩm/thuốc-bệnh nền (food_disease_explain.py)
    - cùng cơ chế như ProductExplanationCache, gộp chung 1 bảng cho cả 2 loại (kind)
    vì shape output giống hệt nhau, chỉ khác 1 cột phân loại."""

    __tablename__ = "food_disease_explanation_cache"
    __table_args__ = (
        UniqueConstraint(
            "kind", "san_pham", "doi_tuong", "muc_do", "audience",
            name="uq_food_disease_explanation_cache",
        ),
    )
    id = Column(String, primary_key=True, default=_uuid)
    kind = Column(String(10), nullable=False)  # "food" | "disease"
    san_pham = Column(String(255), nullable=False)
    doi_tuong = Column(String(255), nullable=False)
    muc_do = Column(String(20), nullable=False)
    audience = Column(String(20), nullable=False)
    giai_thich = Column(Text, nullable=False)
    giai_thich_duoc_si = Column(Text, nullable=True)
    nguon_trich_dan = Column(Text)
    # Tài liệu tham khảo GỐC (nguyên văn từ DDInter) của TỪNG dòng hoạt chất đã gộp
    # vào cạnh này, nối bằng "|" - khác nguon_trich_dan ở trên vốn chỉ là câu tóm tắt
    # "Tổng hợp từ N hoạt chất..." không tra cứu được. Cho cả 2 audience (không phải
    # field chỉ dược sĩ) vì đây là trích dẫn nguồn, không phải nội dung diễn giải.
    nguon_trich_dan_chi_tiet = Column(Text, nullable=True)
    mo_ta_dich = Column(Text, nullable=True)
    xu_tri_dich = Column(Text, nullable=True)  # NULL cho disease (DDSI không có xu_tri)
    created_at = Column(DateTime, default=datetime.utcnow)
