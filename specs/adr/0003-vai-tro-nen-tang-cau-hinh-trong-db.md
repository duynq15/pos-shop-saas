# ADR-0003: Vai trò nền tảng cấu hình trong CSDL, danh mục quyền cố định trong code

- **Trạng thái:** Accepted
- **Ngày:** 2026-09-29
- **Liên quan:** SEC-04, ERR-08, NFR-05, FR-02

## Bối cảnh

Trước GĐ1.7, nền tảng chỉ có một tài khoản `root` toàn quyền. Khi có nhiều cộng đồng, cần chia việc: vận hành, hỗ trợ, kỹ thuật, và người chỉ quản lý một số cộng đồng. Vai trò của tenant (`src/lib/rbac.js`) cố định trong code, nhưng vai trò nền tảng thay đổi theo tổ chức vận hành, không nên phải sửa code mỗi lần.

## Quyết định

- Danh mục quyền nền tảng (`PLATFORM_PERMS`) cố định trong code, vì mỗi quyền gắn với một route cụ thể.
- Vai trò nền tảng lưu trong `control.db` (`platform_roles`, `platform_role_permissions`), sửa được qua giao diện bởi người có quyền `staff.manage`.
- Vai trò `platform` (Quản trị tối cao) có quyền `*`, là vai trò hệ thống, không sửa hay xóa được.
- Phạm vi vai trò chỉ có hai mức: `all` (toàn nền tảng) và `assigned` (chỉ cộng đồng được gán qua `platform_user_communities`). Chưa làm cây phạm vi nhiều cấp.
- Quyền được đọc từ CSDL mỗi request, nên sửa vai trò hoặc tạm ngưng vai trò có hiệu lực ngay, không cần đăng nhập lại.
- Các chốt an toàn: phải còn ít nhất một quản trị tối cao đang hoạt động; không tự sửa vai trò của mình, không tự khóa; không xóa vai trò đang gán; mã vai trò nền tảng không trùng mã vai trò tenant.

## Hệ quả

- Thêm quyền mới vẫn cần sửa code và route; chỉ việc gom quyền thành vai trò là cấu hình được.
- Phạm vi `assigned` phải được lọc ở từng route nền tảng; route mới cần test ERR-08 tương ứng.
- Chưa có phân quyền theo menu hoặc nhiều cấp phạm vi. Làm khi có nhu cầu thật (ví dụ quản lý theo xã / huyện).
