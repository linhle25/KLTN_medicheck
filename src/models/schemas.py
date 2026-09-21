import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


def _valid_email(value: str) -> str:
    value = value.strip()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
        raise ValueError("Email không hợp lệ")
    return value


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="Tin nhắn từ user")


class ChatResponse(BaseModel):
    response: str = Field(..., description="Phản hồi từ agent")
    analysis: str = Field(default="", description="Phân tích nội bộ")


# ---- Auth ----


class RegisterRequest(BaseModel):
    ho_ten: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=3, max_length=255)
    mat_khau: str = Field(..., min_length=8, max_length=128)
    vai_tro: Literal["patient", "pharmacist"]
    so_chung_chi_hanh_nghe: str | None = Field(default=None, max_length=100)
    noi_cong_tac: str | None = Field(default=None, max_length=255)

    _validate_email = field_validator("email")(_valid_email)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    mat_khau: str = Field(..., min_length=1, max_length=255)

    _validate_email = field_validator("email")(_valid_email)


class AuthResponse(BaseModel):
    # Chỉ được điền ngoài production để các client/test Bearer cũ có thời gian
    # chuyển đổi. Giao diện mới xác thực hoàn toàn bằng HttpOnly cookie.
    access_token: str | None = None
    vai_tro: str
    user_id: str
    ho_ten: str
    email: str
    account_status: str


class EmailRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)

    _validate_email = field_validator("email")(_valid_email)


class TokenRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=512)


class ResetPasswordRequest(TokenRequest):
    mat_khau_moi: str = Field(..., min_length=8, max_length=128)


class GoogleCredentialRequest(BaseModel):
    credential: str = Field(..., min_length=20, max_length=10000)


class GoogleRegistrationRequest(GoogleCredentialRequest):
    vai_tro: Literal["patient", "pharmacist"]
    so_chung_chi_hanh_nghe: str | None = Field(default=None, max_length=100)
    noi_cong_tac: str | None = Field(default=None, max_length=255)


class GoogleLinkRequest(GoogleCredentialRequest):
    mat_khau: str = Field(..., min_length=1, max_length=128)


class MessageResponse(BaseModel):
    message: str
    code: str | None = None
    account_status: str | None = None
    email: str | None = None


class PendingPharmacistInfo(BaseModel):
    user_id: str
    ho_ten: str
    email: str
    so_chung_chi_hanh_nghe: str
    noi_cong_tac: str
    ngay_tao: datetime


class RejectPharmacistRequest(BaseModel):
    ly_do: str = Field(..., min_length=3, max_length=1000)


class AdminOverview(BaseModel):
    total_users: int
    patients: int
    pharmacists: int
    locked_users: int
    pending_pharmacists: int
    medications: int
    products: int
    drug_interactions: int
    food_interactions: int
    disease_interactions: int
    open_feedback: int


class AdminUserInfo(BaseModel):
    user_id: str
    ho_ten: str
    email: str
    vai_tro: str
    account_status: str
    email_verified: bool
    ngay_tao: datetime | None = None


class AdminUsersResponse(BaseModel):
    items: list[AdminUserInfo]
    total: int


class AdminAccountStatusRequest(BaseModel):
    account_status: Literal["active", "locked"]


class AdminDrugItem(BaseModel):
    id: str
    name: str
    detail: str | None = None
    source: str | None = None


class AdminDrugDataResponse(BaseModel):
    items: list[AdminDrugItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class FeedbackCreateRequest(BaseModel):
    category: Literal["wrong_result", "technical", "account", "other"] = "other"
    title: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=5, max_length=5000)


class FeedbackUpdateRequest(BaseModel):
    status: Literal["new", "in_progress", "resolved"]
    resolution_note: str | None = Field(default=None, max_length=2000)


class FeedbackInfo(BaseModel):
    id: str
    user_id: str
    user_name: str
    user_email: str
    category: str
    title: str
    description: str
    status: str
    resolution_note: str | None = None
    ngay_tao: datetime
    ngay_cap_nhat: datetime


# ---- Medications (hồ sơ thuốc bệnh nhân) ----


class MedicationItem(BaseModel):
    id: str  # id của bản ghi patient_medications - dùng để xóa
    product_id: str
    ten_thuoc: str
    prescription_id: str
    ngay_bat_dau: date | None = None
    ngay_ket_thuc: date | None = None


class AddMedicationRequest(BaseModel):
    medication_name: str = Field(..., min_length=1, max_length=255)


# ---- Đơn thuốc đã lưu trong hồ sơ (tab "Đơn thuốc của tôi") ----


class PatientPrescriptionSummary(BaseModel):
    id: str
    label: str
    medications: list[MedicationItem]


class CreatePrescriptionRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)


class RenamePrescriptionRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)


class MedicationSearchResult(BaseModel):
    id: str
    ten_chuan_hoa: str


# ---- Thuốc theo tên biệt dược (Product) ----


class ProductSearchResult(BaseModel):
    id: str
    ten_thuoc: str


# ---- Danh mục bệnh nền chuẩn hóa ----


class DiseaseInfo(BaseModel):
    id: int
    ten_benh: str
    ten_benh_vi: str | None = None


class UpdatePatientConditionsRequest(BaseModel):
    # Cho phép danh sách rỗng để bệnh nhân chủ động xóa toàn bộ bệnh nền đã chọn.
    disease_ids: list[int] = Field(default_factory=list, max_length=100)


class PrescriptionInput(BaseModel):
    """1 đơn thuốc gửi lên từ frontend - "đơn thuốc" chỉ là khái niệm ở phía người
    dùng nhập liệu, backend dùng label + danh sách thuốc này để tự tính cạnh cấp
    thuốc và sinh giải thích tương ứng (rollup_explain.py), cùng lọc tương tác GIỮA
    các đơn khi so từ 2 đơn trở lên."""

    label: str = Field(..., min_length=1, max_length=100)
    products: list[str] = Field(..., min_length=1)


class ProductCheckRequest(BaseModel):
    prescriptions: list[PrescriptionInput] = Field(..., min_length=1)
    # Chỉ bật khi chạy từ "Đơn thuốc của tôi". Luồng "Tra cứu tương tác" có thể
    # dùng để tra cứu hộ nên mặc định không lấy bệnh nền trong hồ sơ người đăng nhập.
    personalized: bool = False


class AddProductRequest(BaseModel):
    product_name: str = Field(..., min_length=1, max_length=500)
    # Tùy chọn - nếu bỏ trống, route tự gán vào đơn mặc định của bệnh nhân (tạo mới
    # nếu chưa có đơn nào), giữ tương thích ngược với các client cũ chưa biết khái
    # niệm "đơn thuốc" (VD test_add_and_list_patient_medications không gửi field này).
    prescription_id: str | None = None


# ---- Kiểm tra tương tác ----


class MedicationCheckRequest(BaseModel):
    medications: list[str] = Field(..., min_length=1)


class MedicationCheckResponse(BaseModel):
    interaction_check_id: str
    # Ghi lại ngữ cảnh để giao diện biết đây là hồ sơ của chính người dùng hay một
    # lượt tra cứu chung/tra cứu hộ.
    is_personalized: bool = False
    ranked_results: list[dict]
    explanations: list[dict]
    has_severe: bool
    # Tách riêng cảnh báo nặng thuốc-bệnh để không đổi nghĩa legacy của has_severe
    # (vốn chỉ phản ánh tương tác thuốc-thuốc).
    has_severe_disease_interaction: bool = False
    has_unclassified: bool
    # Chỉ có ở luồng kiểm tra theo tên thuốc (products/check) - tên thuốc không tìm thấy
    # trong CSDL, hoặc tìm thấy nhưng chưa có hoạt chất nào khớp DDInter để tra tương tác.
    unknown_products: list[str] = Field(default_factory=list)
    no_interaction_data_products: list[str] = Field(default_factory=list)
    # Toàn bộ tên thuốc đã nhập ở lần kiểm tra này (kể cả thuốc không có tương tác
    # với thuốc nào khác) - dùng để vẽ đủ node trên đồ thị khi xem lại lịch sử/dược
    # sĩ review, thay vì suy ra danh sách thuốc từ các cặp trong explanations (sẽ
    # thiếu thuốc không có cặp tương tác nào).
    checked_products: list[str] = Field(default_factory=list)
    # Đúng cấu trúc đơn thuốc gốc đã gửi lên (label + danh sách thuốc mỗi đơn) - để
    # xem lại lịch sử/dược sĩ review vẫn dựng được đúng "bàn cân" nhiều đơn như lúc
    # kiểm tra, thay vì gộp hết thuốc vào 1 đơn ảo duy nhất (mất khả năng lọc tương
    # tác GIỮA các đơn). Rỗng ở dữ liệu lịch sử cũ lưu trước khi field này tồn tại.
    prescriptions: list[PrescriptionInput] = Field(default_factory=list)
    # Giải thích riêng cấp thuốc (thuốc-với-thuốc), chỉ nhắc tên thuốc - KHÔNG lấy
    # nguyên văn giải thích cấp hoạt chất trong `explanations` như trước.
    product_explanations: list[dict] = Field(default_factory=list)
    # Tóm tắt tổng quan toàn bộ lần phân tích - sinh cho cả luồng bệnh nhân và dược
    # sĩ, khác nhau ở giọng điệu (xem build_overview_explanation).
    overview: dict | None = None
    # Tương tác thuốc-thực phẩm/thuốc-bệnh nền (DDInter 2.0 DFI/DDSI). Luồng bệnh
    # nhân lọc bệnh theo patient_conditions khi có; nếu chưa khai báo thì giữ tập
    # cảnh báo chung để tương thích. mo_ta_dich/xu_tri_dich chỉ dược sĩ mới thấy.
    food_interactions: list[dict] = Field(default_factory=list)
    disease_interactions: list[dict] = Field(default_factory=list)
    # personalized: đã lọc theo patient_conditions; general_fallback: bệnh nhân đăng nhập
    # chưa khai báo condition nên giữ cảnh báo chung; general: guest/dược sĩ tra cứu độc lập.
    disease_interaction_scope: Literal["personalized", "general_fallback", "general"] = "general"
    # Snapshot condition tại thời điểm kiểm tra để lịch sử không đổi nghĩa khi hồ sơ được sửa sau đó.
    patient_conditions_snapshot: list[DiseaseInfo] = Field(default_factory=list)
    # Danh sách 1-3 câu liệt kê cố định (không qua LLM) tên thực phẩm/bệnh nền cần
    # lưu ý, hiện thành các đoạn riêng sau đoạn overview.giai_thich do LLM sinh.
    canh_bao_thuc_pham_benh_nen: list[str] | None = None
    # Ghi chú dược sĩ để lại khi xác nhận lần kiểm tra này (PharmacistReview.ghi_chu)
    # - chỉ có ở GET /patients/{id}/checks/{check_id} khi đã có dược sĩ xác nhận,
    # None ở mọi trường hợp khác (lần kiểm tra mới chạy, guest, chưa ai xác nhận).
    ghi_chu_duoc_si: str | None = None
    ten_duoc_si_xac_nhan: str | None = None
    # Câu hỏi bệnh nhân đã gửi kèm yêu cầu xét duyệt (nếu có) và câu trả lời tương
    # ứng của dược sĩ - cùng điều kiện hiển thị với ghi_chu_duoc_si ở trên (chỉ có
    # ở getPatientCheckDetail khi đã có dược sĩ xác nhận).
    cau_hoi_benh_nhan: str | None = None
    cau_tra_loi_duoc_si: str | None = None


class InteractionCheckSummary(BaseModel):
    id: str
    thoi_gian_kiem_tra: datetime
    co_canh_bao_nang: bool
    co_chua_phan_loai: bool
    trang_thai_xac_nhan: str
    thuoc_da_kiem_tra: list[str] = Field(default_factory=list)


# ---- Dược sĩ ----


class PharmacistSummary(BaseModel):
    id: str
    ho_ten: str
    noi_cong_tac: str | None = None
    mo_ta_ngan: str | None = None


class ReviewRequestSummary(BaseModel):
    check_id: str
    patient_id: str
    patient_name: str
    thoi_gian_kiem_tra: datetime
    co_canh_bao_nang: bool
    trang_thai_xac_nhan: str
    # Ngữ cảnh bệnh nhân gửi kèm lúc nhờ xác nhận (xem RequestReviewRequest) - đưa
    # thẳng vào đây để trang review dược sĩ lấy được luôn từ listPharmacistRequests,
    # khỏi cần gọi thêm endpoint riêng.
    gui_kem_ho_so: bool = False
    ten_nguoi_duoc_kiem_tra: str | None = None
    ngay_sinh_nhap_tay: date | None = None
    ghi_chu_nhap_tay: str | None = None
    # Nội dung và thời điểm dược sĩ đã xác nhận, để có thể mở lại hồ sơ đã xử lý
    # ở chế độ chỉ xem mà không cần tạo một lượt xác nhận mới.
    ghi_chu: str | None = None
    thoi_gian_xac_nhan: datetime | None = None
    # Câu hỏi bệnh nhân gửi kèm (không bắt buộc) và câu trả lời tương ứng của dược
    # sĩ - tách riêng khỏi ghi_chu (nhận xét chung).
    cau_hoi: str | None = None
    cau_tra_loi: str | None = None


class RequestReviewRequest(BaseModel):
    """Ngữ cảnh bệnh nhân chọn gửi kèm khi nhờ dược sĩ xác nhận 1 lần tra cứu - gửi
    hồ sơ cá nhân CỦA CHÍNH MÌNH (gui_kem_ho_so=True), hoặc tự nhập thông tin cho
    trường hợp tra cứu hộ người khác (3 field dưới), hoặc không gửi gì cả."""

    gui_kem_ho_so: bool = False
    ten_nguoi_duoc_kiem_tra: str | None = Field(default=None, max_length=255)
    ngay_sinh_nhap_tay: date | None = None
    ghi_chu_nhap_tay: str | None = Field(default=None, max_length=2000)
    # Câu hỏi muốn hỏi dược sĩ về lần kiểm tra này - không bắt buộc.
    cau_hoi: str | None = Field(default=None, max_length=2000)


class PharmacistReviewRequest(BaseModel):
    interaction_check_id: str = Field(..., min_length=1)
    ghi_chu: str = Field(default="", max_length=2000)
    # Câu trả lời cho cau_hoi bệnh nhân đã gửi (nếu có) - không bắt buộc, vì bệnh
    # nhân có thể không hỏi gì cả lúc gửi yêu cầu.
    cau_tra_loi: str | None = Field(default=None, max_length=2000)


class PharmacistReviewResponse(BaseModel):
    id: str
    interaction_check_id: str
    trang_thai_xac_nhan: str
    ghi_chu: str
    cau_tra_loi: str | None = None


# ---- Hồ sơ cá nhân dược sĩ ----


class PharmacistProfileInfo(BaseModel):
    ho_ten: str | None = None
    noi_cong_tac: str | None = None
    mo_ta_ngan: str | None = None


class UpdatePharmacistProfileRequest(BaseModel):
    ho_ten: str | None = Field(default=None, max_length=255)
    noi_cong_tac: str | None = Field(default=None, max_length=255)
    mo_ta_ngan: str | None = Field(default=None, max_length=2000)


# ---- Thông báo ----


class NotificationItem(BaseModel):
    id: str
    noi_dung: str
    da_doc: bool
    thoi_gian_tao: datetime
    interaction_check_id: str | None = None


# ---- Hồ sơ cá nhân bệnh nhân ----


class PatientProfileInfo(BaseModel):
    ho_ten: str | None = None
    ngay_sinh: date | None = None
    gioi_tinh: str | None = None
    can_nang: float | None = None
    chieu_cao: float | None = None
    benh_nen_ghi_chu: str | None = None
    di_ung_thuoc: str | None = None
    tinh_trang_khac: str | None = None


class UpdatePatientProfileRequest(BaseModel):
    ho_ten: str | None = Field(default=None, max_length=255)
    ngay_sinh: date | None = None
    gioi_tinh: str | None = Field(default=None, max_length=20)
    can_nang: float | None = Field(default=None, ge=1, le=300, allow_inf_nan=False)
    chieu_cao: float | None = Field(default=None, ge=30, le=250, allow_inf_nan=False)
    benh_nen_ghi_chu: str | None = Field(default=None, max_length=2000)
    di_ung_thuoc: str | None = Field(default=None, max_length=2000)
    tinh_trang_khac: str | None = Field(default=None, max_length=2000)

    @field_validator("ngay_sinh")
    @classmethod
    def validate_age(cls, value: date | None) -> date | None:
        if value is None:
            return value
        today = date.today()
        age = today.year - value.year - ((today.month, today.day) < (value.month, value.day))
        if age < 0 or age > 120:
            raise ValueError("Tuổi phải nằm trong khoảng 0–120")
        return value
