# Hướng dẫn cài đặt VEO Automation Extension

## Bước 1 — Tạo icon (chạy 1 lần)

Mở PowerShell trong thư mục `veo-extension\` rồi chạy:

```powershell
pwsh -File create-icons.ps1
```

Nếu không có PowerShell 7, bỏ qua và tạo thủ công 4 ảnh PNG trống tên:
- `icons/icon16.png`
- `icons/icon32.png`
- `icons/icon48.png`
- `icons/icon128.png`

## Bước 2 — Cài vào Chrome

1. Mở Chrome → gõ vào thanh địa chỉ: `chrome://extensions`
2. Bật **Developer mode** (góc trên phải)
3. Bấm **Load unpacked**
4. Chọn thư mục `d:\dự án youtube\veo-extension`
5. Extension xuất hiện trong danh sách ✓

## Bước 3 — Sử dụng

1. Mở `labs.google.com/fx/tools/flow` → đăng nhập Google
2. Click icon VEO Automation trên thanh Chrome (hoặc pin nó)
3. Side Panel mở ra bên phải
4. Nhập danh sách prompt → Bấm **▶ Bắt đầu tự động**

## Cấu trúc file

```
veo-extension/
├── manifest.json          ← Khai báo extension
├── sidepanel.html         ← Giao diện Side Panel
├── src/
│   ├── background.js      ← Quản lý queue & download
│   ├── content.js         ← Tương tác với Google Flow DOM
│   └── sidepanel.js       ← Logic giao diện
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── create-icons.ps1       ← Script tạo icon
```

## Lưu ý

- Extension dùng **Manifest V3** (chuẩn mới nhất của Chrome)
- Khi Google Flow cập nhật giao diện → có thể cần chỉnh selector trong `content.js`
- Video tải về lưu tại: `Downloads/VEO_Automation/`
