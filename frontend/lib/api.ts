// Requests stay relative (same-origin) so the auth cookies aren't cross-site -
// mobile Safari/WebKit silently drops third-party cookies even with
// SameSite=None, which broke login on phones. next.config.js rewrites
// /api/:path* to the real backend (NEXT_PUBLIC_API_URL) at the server layer.
const API_URL = "";
let csrfCache: string | undefined;

export type Severity = "nhe" | "trung_binh" | "nang" | "chua_phan_loai";

export type InteractionExplanation = {
  thuoc_a?: string;
  thuoc_b?: string;
  medication_a_id?: string;
  medication_b_id?: string;
  muc_do?: Severity;
  // Chỉ có giá trị ở 2 trường hợp đặc biệt (thiếu dữ liệu/chưa phân loại) - cấp
  // hoạt chất không còn qua LLM viết văn nữa (xem explain_node.py), và giai_thich
  // cấp này chưa từng hiển thị ở bất kỳ luồng nào trong app (chỉ dùng dựng đồ thị).
  giai_thich?: string;
  // Bản giọng điệu khoa học/chuyên nghiệp dành cho dược sĩ - chỉ có mặt khi gọi qua
  // endpoint/luồng dành cho dược sĩ (giống xu_tri/thay_the/mo_ta bên dưới).
  giai_thich_duoc_si?: string;
  nguon_trich_dan: string;
  // Chỉ có mặt khi gọi qua endpoint dành cho dược sĩ (GET /pharmacist/reviews/{id}).
  xu_tri?: string;
  thay_the_a?: string;
  thay_the_b?: string;
  // Mô tả khoa học nguyên văn từ CSDL DDInter 2.0 (không qua AI diễn giải lại) -
  // cũng chỉ dược sĩ mới thấy, giống xu_tri/thay_the.
  mo_ta?: string;
  // Bản dịch nguyên văn (không qua diễn giải, chỉ dịch sát nghĩa) từ tiếng Anh sang
  // tiếng Việt của mo_ta/xu_tri gốc - cùng mức truy cập, chỉ dược sĩ mới thấy.
  mo_ta_dich?: string;
  xu_tri_dich?: string;
  // Chỉ có ở luồng kiểm tra theo tên thuốc (products/check) - hoạt chất gốc và
  // danh sách tên thuốc (trong lần kiểm tra hiện tại) chứa hoạt chất đó, dùng để
  // gộp (rollup) cạnh ở cấp thuốc trên đồ thị tương tác.
  hoat_chat_a?: string;
  hoat_chat_b?: string;
  san_pham_a?: string[];
  san_pham_b?: string[];
};

// Giải thích cấp thuốc (thuốc-với-thuốc) do backend tự tổng hợp + sinh riêng - chỉ
// nhắc tên 2 thuốc, không lộ tên hoạt chất bên trong (khác InteractionExplanation).
export type ProductLevelExplanation = {
  thuoc_a: string;
  thuoc_b: string;
  muc_do?: Severity;
  giai_thich: string;
  giai_thich_duoc_si?: string;
  nguon_trich_dan: string;
  // Bản dịch nguyên văn (Anh -> Việt) của mo_ta/xu_tri lấy từ cặp hoạt chất góp
  // phần nặng nhất - chỉ dược sĩ mới thấy, giống ProductLevelExplanation khác.
  mo_ta_dich?: string;
  xu_tri_dich?: string;
};

// Đoạn tóm tắt tổng quan toàn bộ lần phân tích (cả luồng bệnh nhân và dược sĩ, khác
// giọng điệu) - LLM sinh 1 đoạn dựa trên thống kê + toàn bộ giải thích cấp thuốc-thuốc tìm được.
export type InteractionOverviewExplanation = {
  giai_thich: string;
  // Cụm từ AI tự chọn nhấn mạnh trong giai_thich, kèm mức độ để tô màu đúng -
  // backend tách sẵn từ markup {{muc_do:...}}, xem rollup_explain.py::_parse_highlights.
  nhan_manh?: { text: string; muc_do: Severity }[];
  so_cap_nang: number;
  so_cap_trung_binh: number;
  so_cap_nhe: number;
  so_cap_chua_phan_loai: number;
  tong_so_cap: number;
};

// Đúng cấu trúc đơn thuốc gốc đã gửi lên lúc kiểm tra (label + danh sách thuốc
// mỗi đơn) - lưu lại trong lịch sử để xem lại (bệnh nhân/dược sĩ review) vẫn dựng
// được đúng "bàn cân" nhiều đơn như lúc kiểm tra, thay vì gộp hết thuốc vào 1 đơn
// ảo duy nhất. Rỗng/undefined ở dữ liệu lịch sử cũ lưu trước khi field này tồn tại.
export type PrescriptionSummary = { label: string; products: string[] };

// Tương tác thuốc-thực phẩm/thuốc-bệnh nền (DDInter 2.0 DFI/DDSI) - thông tin CHUNG
// theo từng hoạt chất đang kiểm tra, không lọc theo hồ sơ bệnh nền cá nhân. Đã gộp
// theo THUỐC (san_pham luôn có đúng 1 phần tử - có thể nhiều thẻ nếu 1 hoạt chất
// thuộc nhiều thuốc đang kiểm tra) - không còn field hoat_chat riêng lẻ, giống cơ
// chế gộp cấp thuốc bên tương tác thuốc-thuốc. mo_ta_dich/xu_tri_dich chỉ dược sĩ
// mới thấy (backend đã tự ẩn với bệnh nhân).
export type FoodInteractionExplanation = {
  san_pham: string[];
  thuc_pham: string;
  muc_do?: Severity;
  giai_thich: string;
  giai_thich_duoc_si?: string;
  nguon_trich_dan: string;
  // Tài liệu tham khảo GỐC (nối bằng "|") của từng hoạt chất đã gộp vào cạnh này -
  // khác nguon_trich_dan ở trên vốn chỉ là câu tóm tắt số lượng. Dùng với
  // buildCitationReferences (lib/interactionGraph.ts) để hiện trong AlertCard.
  nguon_trich_dan_chi_tiet?: string;
  mo_ta_dich?: string;
  xu_tri_dich?: string;
};

export type DiseaseInteractionExplanation = {
  san_pham: string[];
  ten_benh: string;
  muc_do?: Severity;
  giai_thich: string;
  giai_thich_duoc_si?: string;
  nguon_trich_dan: string;
  nguon_trich_dan_chi_tiet?: string;
  // Không có xu_tri_dich - nguồn DDInter cho tương tác bệnh nền không có trường xử trí.
  mo_ta_dich?: string;
};

export type MedicationCheckResponse = {
  interaction_check_id: string;
  // true chỉ với lượt chạy từ "Đơn thuốc của tôi"; false với tra cứu chung/tra cứu hộ.
  is_personalized?: boolean;
  ranked_results: Record<string, unknown>[];
  explanations: InteractionExplanation[];
  has_severe: boolean;
  has_severe_disease_interaction?: boolean;
  has_unclassified: boolean;
  // Chỉ có ở luồng kiểm tra theo tên thuốc (checkProducts/...).
  unknown_products?: string[];
  no_interaction_data_products?: string[];
  // Toàn bộ tên thuốc đã nhập ở lần kiểm tra này (kể cả thuốc không có tương tác
  // với thuốc nào khác) - dùng để vẽ đủ node trên đồ thị, không bị thiếu thuốc
  // "cô đơn" (không thuộc cặp giải thích nào). Undefined ở dữ liệu lịch sử cũ,
  // trước khi field này tồn tại.
  checked_products?: string[];
  prescriptions?: PrescriptionSummary[];
  product_explanations?: ProductLevelExplanation[];
  overview?: InteractionOverviewExplanation;
  food_interactions?: FoodInteractionExplanation[];
  disease_interactions?: DiseaseInteractionExplanation[];
  disease_interaction_scope?: "personalized" | "general_fallback" | "general";
  patient_conditions_snapshot?: DiseaseInfo[];
  // Danh sách 1-3 câu liệt kê cố định (không qua LLM) tên thực phẩm/bệnh nền cần
  // lưu ý, hiện thành các đoạn riêng sau đoạn overview.giai_thich do LLM sinh.
  canh_bao_thuc_pham_benh_nen?: string[];
  // Ghi chú dược sĩ để lại khi xác nhận lần kiểm tra này - chỉ có ở
  // getPatientCheckDetail khi đã có dược sĩ xác nhận, undefined mọi trường hợp khác.
  ghi_chu_duoc_si?: string;
  ten_duoc_si_xac_nhan?: string;
  // Câu hỏi bệnh nhân đã gửi kèm yêu cầu xét duyệt (nếu có) + câu trả lời tương ứng
  // của dược sĩ - cùng điều kiện hiển thị với ghi_chu_duoc_si ở trên.
  cau_hoi_benh_nhan?: string;
  cau_tra_loi_duoc_si?: string;
};

// Kết quả thô từ GET /pharmacist/reviews/{id} - chính là state agent đầy đủ
// (không có interaction_check_id bên trong, có thể thiếu field nếu rỗng).
export type AgentCheckResult = {
  ranked_results?: Record<string, unknown>[];
  explanations?: InteractionExplanation[];
  has_severe?: boolean;
  has_severe_disease_interaction?: boolean;
  has_unclassified?: boolean;
  checked_products?: string[];
  prescriptions?: PrescriptionSummary[];
  product_explanations?: ProductLevelExplanation[];
  overview?: InteractionOverviewExplanation;
  food_interactions?: FoodInteractionExplanation[];
  disease_interactions?: DiseaseInteractionExplanation[];
  disease_interaction_scope?: "personalized" | "general_fallback" | "general";
  patient_conditions_snapshot?: DiseaseInfo[];
  canh_bao_thuc_pham_benh_nen?: string[];
};

// Payload gửi lên các endpoint /products/check - 1 phần tử = 1 đơn thuốc.
export type PrescriptionCheckInput = { label: string; products: string[] };

export type AuthResponse = {
  access_token?: string | null;
  vai_tro: "patient" | "pharmacist" | "admin";
  user_id: string;
  ho_ten: string;
  email: string;
  account_status: string;
};

export type AuthMessage = { message: string; code?: string | null; account_status?: string | null; email?: string | null };
export type GoogleAuthResult = AuthResponse | {
  code: "REGISTRATION_REQUIRED" | "ACCOUNT_LINK_REQUIRED" | "PHARMACIST_APPROVAL_PENDING" | "EMAIL_VERIFICATION_REQUIRED";
  message?: string;
  email?: string;
  ho_ten?: string;
  account_status?: string;
};

export type MedicationItem = {
  id: string;
  product_id: string;
  ten_thuoc: string;
  prescription_id: string;
  ngay_bat_dau: string | null;
  ngay_ket_thuc: string | null;
};

// Đơn thuốc đã lưu trong hồ sơ bệnh nhân (tab "Đơn thuốc của tôi") - khác
// `PrescriptionCheckInput`/`Prescription` (lib/prescription.ts) vốn chỉ sống trong
// phiên làm việc của bàn cân tương tác, không có id thật từ backend.
export type PatientPrescription = {
  id: string;
  label: string;
  medications: MedicationItem[];
};

export type MedicationSearchResult = {
  id: string;
  ten_chuan_hoa: string;
};

export type ProductSearchResult = {
  id: string;
  ten_thuoc: string;
};

export type DiseaseInfo = {
  id: number;
  ten_benh: string;
  ten_benh_vi: string | null;
};

export type PatientSummary = {
  id: string;
  ho_ten: string;
  co_canh_bao_nang_chua_xu_ly: boolean;
};

export type InteractionCheckSummary = {
  id: string;
  thoi_gian_kiem_tra: string;
  co_canh_bao_nang: boolean;
  co_chua_phan_loai: boolean;
  trang_thai_xac_nhan: string;
  thuoc_da_kiem_tra: string[];
};

export type PharmacistReviewResponse = {
  id: string;
  interaction_check_id: string;
  trang_thai_xac_nhan: string;
  ghi_chu: string;
  cau_tra_loi?: string;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string; skipRefresh?: boolean } = {},
  retried = false,
): Promise<T> {
  const { token: _legacyToken, skipRefresh, headers, ...rest } = options;
  const method = (rest.method || "GET").toUpperCase();
  let csrfToken: string | undefined;
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && path !== "/api/v1/auth/csrf") {
    csrfToken = await ensureCsrfToken();
  }
  // Upload ảnh (quét đơn thuốc) gửi FormData: phải để trình duyệt tự đặt
  // Content-Type kèm boundary của multipart. Tự đặt "application/json" ở đây sẽ
  // làm hỏng body và backend không đọc được file.
  const isFormData = typeof FormData !== "undefined" && rest.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...headers,
    },
  });

  // Cookie CSRF có thể đã được một tab/request khác làm mới trong khi SPA vẫn
  // giữ token cũ trong bộ nhớ. Khi backend xác nhận đúng lỗi mismatch, lấy một
  // token mới và thử lại duy nhất một lần; không retry các lỗi 403 phân quyền.
  if (res.status === 403 && !retried && csrfToken) {
    const errorBody = await res.clone().json().catch(() => null);
    if (errorBody?.detail === "CSRF token khong hop le") {
      await ensureCsrfToken(true);
      return request<T>(path, options, true);
    }
  }

  if (res.status === 401 && !retried && !skipRefresh && !["/api/v1/auth/login", "/api/v1/auth/refresh"].includes(path)) {
    const refreshCsrf = csrfToken || await ensureCsrfToken();
    const refreshed = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: refreshCsrf ? { "X-CSRF-Token": refreshCsrf } : {},
    });
    if (refreshed.ok) return request<T>(path, options, true);
  }

  if (!res.ok) {
    let detail = `Lỗi ${res.status}`;
    let code: string | undefined;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
      else if (body?.message) detail = body.message;
      code = body?.code;
    } catch {
      // body không phải JSON hợp lệ - giữ nguyên thông báo mặc định
    }
    throw new ApiError(res.status, detail, code);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const prefix = `${name}=`;
  return document.cookie.split("; ").find((part) => part.startsWith(prefix))?.slice(prefix.length);
}

async function ensureCsrfToken(forceRefresh = false): Promise<string | undefined> {
  // Luôn ưu tiên cookie hiện tại thay vì cache cũ: endpoint /csrf hoặc một tab
  // khác có thể đã xoay cookie sau lần request trước.
  const cookieToken = getCookie("medguard_csrf");
  if (!forceRefresh && cookieToken) {
    csrfCache = cookieToken;
    return cookieToken;
  }
  if (!forceRefresh && csrfCache) return csrfCache;
  csrfCache = undefined;
  const response = await fetch(`${API_URL}/api/v1/auth/csrf`, { credentials: "include" });
  if (response.ok) csrfCache = (await response.json()).csrf_token;
  return csrfCache;
}

// ---- Auth ----

export async function register(
  hoTen: string,
  email: string,
  matKhau: string,
  vaiTro: "patient" | "pharmacist",
  soChungChi?: string,
  noiCongTac?: string,
): Promise<AuthMessage> {
  return request<AuthMessage>("/api/v1/auth/register", {
    method: "POST",
    skipRefresh: true,
    body: JSON.stringify({ ho_ten: hoTen, email, mat_khau: matKhau, vai_tro: vaiTro, so_chung_chi_hanh_nghe: soChungChi, noi_cong_tac: noiCongTac }),
  });
}

export async function login(email: string, matKhau: string): Promise<GoogleAuthResult> {
  return request<GoogleAuthResult>("/api/v1/auth/login", {
    method: "POST",
    skipRefresh: true,
    body: JSON.stringify({ email, mat_khau: matKhau }),
  });
}

export const getMe = () => request<AuthResponse>("/api/v1/auth/me");
export const logout = () => request<void>("/api/v1/auth/logout", { method: "POST", skipRefresh: true });
export const verifyEmail = (token: string) => request<AuthMessage>("/api/v1/auth/verify-email", { method: "POST", skipRefresh: true, body: JSON.stringify({ token }) });
export const resendVerification = (email: string) => request<AuthMessage>("/api/v1/auth/resend-verification", { method: "POST", skipRefresh: true, body: JSON.stringify({ email }) });
export const forgotPassword = (email: string) => request<AuthMessage>("/api/v1/auth/forgot-password", { method: "POST", skipRefresh: true, body: JSON.stringify({ email }) });
export const resetPassword = (token: string, password: string) => request<AuthMessage>("/api/v1/auth/reset-password", { method: "POST", skipRefresh: true, body: JSON.stringify({ token, mat_khau_moi: password }) });
export const googleLogin = (credential: string) => request<GoogleAuthResult>("/api/v1/auth/google", { method: "POST", skipRefresh: true, body: JSON.stringify({ credential }) });
export const completeGoogleRegistration = (credential: string, vaiTro: "patient" | "pharmacist", soChungChi?: string, noiCongTac?: string) => request<GoogleAuthResult>("/api/v1/auth/google/complete-registration", { method: "POST", skipRefresh: true, body: JSON.stringify({ credential, vai_tro: vaiTro, so_chung_chi_hanh_nghe: soChungChi, noi_cong_tac: noiCongTac }) });
export const linkGoogle = (credential: string, password: string) => request<GoogleAuthResult>("/api/v1/auth/google/link", { method: "POST", skipRefresh: true, body: JSON.stringify({ credential, mat_khau: password }) });

export type PendingPharmacist = { user_id: string; ho_ten: string; email: string; so_chung_chi_hanh_nghe: string; noi_cong_tac: string; ngay_tao: string };
export const listPendingPharmacists = () => request<PendingPharmacist[]>("/api/v1/admin/pharmacists/pending");
export const approvePharmacist = (userId: string) => request<AuthMessage>(`/api/v1/admin/pharmacists/${userId}/approve`, { method: "POST" });
export const rejectPharmacist = (userId: string, reason: string) => request<AuthMessage>(`/api/v1/admin/pharmacists/${userId}/reject`, { method: "POST", body: JSON.stringify({ ly_do: reason }) });

export type AdminOverview = {
  total_users: number;
  patients: number;
  pharmacists: number;
  locked_users: number;
  pending_pharmacists: number;
  medications: number;
  products: number;
  drug_interactions: number;
  food_interactions: number;
  disease_interactions: number;
  open_feedback: number;
};

export type AdminUser = {
  user_id: string;
  ho_ten: string;
  email: string;
  vai_tro: "patient" | "pharmacist";
  account_status: string;
  email_verified: boolean;
  ngay_tao: string | null;
};

export type AdminUsersResponse = { items: AdminUser[]; total: number };
export type AdminDrugItem = { id: string; name: string; detail: string | null; source: string | null };
export type AdminDrugDataResponse = {
  items: AdminDrugItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};
export type AdminFeedback = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  category: string;
  title: string;
  description: string;
  status: "new" | "in_progress" | "resolved";
  resolution_note: string | null;
  ngay_tao: string;
  ngay_cap_nhat: string;
};

export const getAdminOverview = () => request<AdminOverview>("/api/v1/admin/overview");
export const listAdminUsers = (params: { q?: string; role?: string; status?: string } = {}) => {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.role) query.set("role", params.role);
  if (params.status) query.set("account_status", params.status);
  return request<AdminUsersResponse>(`/api/v1/admin/users?${query}`);
};
export const updateAdminUserStatus = (userId: string, accountStatus: "active" | "locked") =>
  request<AuthMessage>(`/api/v1/admin/users/${userId}/status`, {
    method: "POST",
    body: JSON.stringify({ account_status: accountStatus }),
  });
export const listAdminDrugData = (q = "", kind: "medication" | "product" = "medication", page = 1, pageSize = 24) => {
  const query = new URLSearchParams({ q, kind, page: String(page), page_size: String(pageSize) });
  return request<AdminDrugDataResponse>(`/api/v1/admin/drug-data?${query}`);
};
export const listAdminFeedback = (status = "") =>
  request<AdminFeedback[]>(`/api/v1/admin/feedback${status ? `?status=${encodeURIComponent(status)}` : ""}`);
export const updateAdminFeedback = (
  feedbackId: string,
  status: AdminFeedback["status"],
  resolutionNote?: string,
) => request<AdminFeedback>(`/api/v1/admin/feedback/${feedbackId}`, {
  method: "PATCH",
  body: JSON.stringify({ status, resolution_note: resolutionNote || null }),
});

// ---- Tra cứu / hồ sơ thuốc ----

export async function searchMedications(
  q: string,
  token: string
): Promise<MedicationSearchResult[]> {
  return request<MedicationSearchResult[]>(
    `/api/v1/medications/search?q=${encodeURIComponent(q)}`,
    { token }
  );
}

export async function searchGuestMedications(q: string): Promise<MedicationSearchResult[]> {
  return request<MedicationSearchResult[]>(`/api/v1/guest/medications/search?q=${encodeURIComponent(q)}`);
}

export async function searchProducts(q: string, token: string): Promise<ProductSearchResult[]> {
  return request<ProductSearchResult[]>(
    `/api/v1/products/search?q=${encodeURIComponent(q)}`,
    { token }
  );
}

export async function searchGuestProducts(q: string): Promise<ProductSearchResult[]> {
  return request<ProductSearchResult[]>(`/api/v1/guest/products/search?q=${encodeURIComponent(q)}`);
}

export async function searchDiseases(
  q: string,
  token: string,
  limit = 20
): Promise<DiseaseInfo[]> {
  return request<DiseaseInfo[]>(
    `/api/v1/diseases/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    { token }
  );
}

export async function getPatientConditions(
  patientId: string,
  token: string
): Promise<DiseaseInfo[]> {
  return request<DiseaseInfo[]>(`/api/v1/patients/${patientId}/conditions`, { token });
}

export async function updatePatientConditions(
  patientId: string,
  diseaseIds: number[],
  token: string
): Promise<DiseaseInfo[]> {
  return request<DiseaseInfo[]>(`/api/v1/patients/${patientId}/conditions`, {
    method: "PUT",
    token,
    body: JSON.stringify({ disease_ids: diseaseIds }),
  });
}

export async function listPatientMedications(
  patientId: string,
  token: string
): Promise<MedicationItem[]> {
  return request<MedicationItem[]>(`/api/v1/patients/${patientId}/medications`, { token });
}

export async function addPatientMedication(
  patientId: string,
  productName: string,
  token: string,
  prescriptionId?: string
): Promise<MedicationItem> {
  return request<MedicationItem>(`/api/v1/patients/${patientId}/medications`, {
    method: "POST",
    token,
    body: JSON.stringify({ product_name: productName, prescription_id: prescriptionId }),
  });
}

export async function removePatientMedication(
  patientId: string,
  patientMedicationId: string,
  token: string
): Promise<void> {
  return request<void>(`/api/v1/patients/${patientId}/medications/${patientMedicationId}`, {
    method: "DELETE",
    token,
  });
}

export async function listPatientPrescriptions(
  patientId: string,
  token: string
): Promise<PatientPrescription[]> {
  return request<PatientPrescription[]>(`/api/v1/patients/${patientId}/prescriptions`, { token });
}

export async function createPatientPrescription(
  patientId: string,
  label: string,
  token: string
): Promise<PatientPrescription> {
  return request<PatientPrescription>(`/api/v1/patients/${patientId}/prescriptions`, {
    method: "POST",
    token,
    body: JSON.stringify({ label }),
  });
}

export async function renamePatientPrescription(
  patientId: string,
  prescriptionId: string,
  label: string,
  token: string
): Promise<PatientPrescription> {
  return request<PatientPrescription>(`/api/v1/patients/${patientId}/prescriptions/${prescriptionId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ label }),
  });
}

export async function deletePatientPrescription(
  patientId: string,
  prescriptionId: string,
  token: string
): Promise<void> {
  return request<void>(`/api/v1/patients/${patientId}/prescriptions/${prescriptionId}`, {
    method: "DELETE",
    token,
  });
}

// ---- Kiểm tra tương tác ----

export async function checkMedications(
  medications: string[],
  token: string
): Promise<MedicationCheckResponse> {
  return request<MedicationCheckResponse>("/api/v1/medications/check", {
    method: "POST",
    token,
    body: JSON.stringify({ medications }),
  });
}

export async function checkGuestMedications(medications: string[]): Promise<MedicationCheckResponse> {
  return request<MedicationCheckResponse>("/api/v1/guest/medications/check", {
    method: "POST",
    body: JSON.stringify({ medications }),
  });
}

export async function checkProducts(
  prescriptions: PrescriptionCheckInput[],
  token: string,
  options?: { personalized?: boolean }
): Promise<MedicationCheckResponse> {
  return request<MedicationCheckResponse>("/api/v1/products/check", {
    method: "POST",
    token,
    body: JSON.stringify({ prescriptions, personalized: options?.personalized ?? false }),
  });
}

export async function checkGuestProducts(
  prescriptions: PrescriptionCheckInput[]
): Promise<MedicationCheckResponse> {
  return request<MedicationCheckResponse>("/api/v1/guest/products/check", {
    method: "POST",
    body: JSON.stringify({ prescriptions }),
  });
}

export async function listPatientChecks(
  patientId: string,
  token: string
): Promise<InteractionCheckSummary[]> {
  return request<InteractionCheckSummary[]>(`/api/v1/patients/${patientId}/checks`, { token });
}

export async function getPatientCheckDetail(
  patientId: string,
  checkId: string,
  token: string
): Promise<MedicationCheckResponse> {
  return request<MedicationCheckResponse>(`/api/v1/patients/${patientId}/checks/${checkId}`, {
    token,
  });
}

export async function deleteAllPatientChecks(
  patientId: string,
  token: string
): Promise<void> {
  return request<void>(`/api/v1/patients/${patientId}/checks`, {
    method: "DELETE",
    token,
  });
}

export async function deletePatientCheck(
  patientId: string,
  checkId: string,
  token: string
): Promise<void> {
  return request<void>(`/api/v1/patients/${patientId}/checks/${checkId}`, {
    method: "DELETE",
    token,
  });
}

// ---- Dược sĩ ----

export interface PharmacistSummary {
  id: string;
  ho_ten: string;
  noi_cong_tac?: string;
  mo_ta_ngan?: string;
}

export async function getPharmacists(token: string): Promise<PharmacistSummary[]> {
  return request<PharmacistSummary[]>("/api/v1/pharmacists", { token });
}

// Ngữ cảnh bệnh nhân chọn gửi kèm khi nhờ dược sĩ xác nhận: hồ sơ cá nhân của
// chính mình (guiKemHoSo=true), HOẶC tự nhập thông tin cho trường hợp tra cứu hộ
// người khác (2 field đầu bắt buộc điền chung, ghi chú tùy chọn), HOẶC không gửi gì.
export type RequestReviewPayload = {
  guiKemHoSo?: boolean;
  tenNguoiDuocKiemTra?: string;
  ngaySinhNhapTay?: string;
  ghiChuNhapTay?: string;
  // Câu hỏi muốn hỏi dược sĩ về lần kiểm tra này - không bắt buộc.
  cauHoi?: string;
};

export async function requestReview(
  checkId: string,
  pharmacistId: string,
  token: string,
  payload?: RequestReviewPayload
): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/v1/checks/${checkId}/pharmacists/${pharmacistId}/request_review`, {
    method: "POST",
    token,
    body: JSON.stringify({
      gui_kem_ho_so: payload?.guiKemHoSo ?? false,
      ten_nguoi_duoc_kiem_tra: payload?.tenNguoiDuocKiemTra || null,
      ngay_sinh_nhap_tay: payload?.ngaySinhNhapTay || null,
      ghi_chu_nhap_tay: payload?.ghiChuNhapTay || null,
      cau_hoi: payload?.cauHoi || null,
    }),
  });
}

export interface ReviewRequestSummary {
  check_id: string;
  patient_id: string;
  patient_name: string;
  thoi_gian_kiem_tra: string;
  co_canh_bao_nang: boolean;
  trang_thai_xac_nhan: string;
  gui_kem_ho_so: boolean;
  ten_nguoi_duoc_kiem_tra: string | null;
  ngay_sinh_nhap_tay: string | null;
  ghi_chu_nhap_tay: string | null;
  ghi_chu: string | null;
  thoi_gian_xac_nhan: string | null;
  cau_hoi: string | null;
  cau_tra_loi: string | null;
}

export async function listPharmacistRequests(
  token: string
): Promise<ReviewRequestSummary[]> {
  return request<ReviewRequestSummary[]>(`/api/v1/pharmacist/requests`, {
    token,
  });
}

export async function getInteractionCheckDetail(
  checkId: string,
  token: string
): Promise<AgentCheckResult> {
  return request<AgentCheckResult>(`/api/v1/pharmacist/reviews/${checkId}`, { token });
}

export async function submitPharmacistReview(
  checkId: string,
  ghiChu: string,
  token: string,
  cauTraLoi?: string
): Promise<PharmacistReviewResponse> {
  return request<PharmacistReviewResponse>("/api/v1/pharmacist/reviews", {
    method: "POST",
    token,
    body: JSON.stringify({ interaction_check_id: checkId, ghi_chu: ghiChu, cau_tra_loi: cauTraLoi || null }),
  });
}

export async function checkMedicationsAsPharmacist(
  medications: string[],
  token: string
): Promise<MedicationCheckResponse> {
  return request<MedicationCheckResponse>("/api/v1/pharmacist/medications/check", {
    method: "POST",
    token,
    body: JSON.stringify({ medications }),
  });
}

export async function checkProductsAsPharmacist(
  prescriptions: PrescriptionCheckInput[],
  token: string
): Promise<MedicationCheckResponse> {
  return request<MedicationCheckResponse>("/api/v1/pharmacist/products/check", {
    method: "POST",
    token,
    body: JSON.stringify({ prescriptions }),
  });
}

// ---- Hồ sơ cá nhân bệnh nhân ----

export type PatientProfileInfo = {
  ho_ten: string | null;
  ngay_sinh: string | null;
  gioi_tinh: string | null;
  can_nang: number | null;
  chieu_cao: number | null;
  benh_nen_ghi_chu: string | null;
  di_ung_thuoc: string | null;
  tinh_trang_khac: string | null;
};

export async function getPatientProfile(
  patientId: string,
  token: string
): Promise<PatientProfileInfo> {
  return request<PatientProfileInfo>(`/api/v1/patients/${patientId}/profile`, { token });
}

export async function getSharedPatientProfile(
  checkId: string,
  token: string
): Promise<PatientProfileInfo> {
  return request<PatientProfileInfo>(`/api/v1/pharmacist/reviews/${checkId}/patient-profile`, { token });
}

export async function updatePatientProfile(
  patientId: string,
  data: Partial<PatientProfileInfo>,
  token: string
): Promise<PatientProfileInfo> {
  return request<PatientProfileInfo>(`/api/v1/patients/${patientId}/profile`, {
    method: "PATCH",
    token,
    body: JSON.stringify(data),
  });
}

// ---- Hồ sơ cá nhân dược sĩ ----

export type PharmacistProfileInfo = {
  ho_ten: string | null;
  noi_cong_tac: string | null;
  mo_ta_ngan: string | null;
};

export async function getPharmacistProfile(
  pharmacistId: string,
  token: string
): Promise<PharmacistProfileInfo> {
  return request<PharmacistProfileInfo>(`/api/v1/pharmacists/${pharmacistId}/profile`, { token });
}

export async function updatePharmacistProfile(
  pharmacistId: string,
  data: Partial<PharmacistProfileInfo>,
  token: string
): Promise<PharmacistProfileInfo> {
  return request<PharmacistProfileInfo>(`/api/v1/pharmacists/${pharmacistId}/profile`, {
    method: "PATCH",
    token,
    body: JSON.stringify(data),
  });
}

// ---- Thông báo ----

export type NotificationItem = {
  id: string;
  noi_dung: string;
  da_doc: boolean;
  thoi_gian_tao: string;
  interaction_check_id: string | null;
};

export async function listPatientNotifications(
  patientId: string,
  token: string
): Promise<NotificationItem[]> {
  return request<NotificationItem[]>(`/api/v1/patients/${patientId}/notifications`, { token });
}

export async function markNotificationRead(
  patientId: string,
  notificationId: string,
  token: string
): Promise<void> {
  return request<void>(`/api/v1/patients/${patientId}/notifications/${notificationId}/read`, {
    method: "POST",
    token,
  });
}
