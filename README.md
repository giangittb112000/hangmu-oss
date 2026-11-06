# Hang MU

Website 3D multiplayer dành cho fan Manchester United: vào "hang", đi lại, trò chuyện, ăn mừng bàn thắng cùng mọi người theo thời gian thực.

> Dự án fan-made, không liên kết chính thức với Manchester United.

## Công nghệ

- **Frontend:** React, TypeScript, Vite, Three.js, React Three Fiber
- **Backend:** Rust, Axum, Tokio, WebSocket
- **Dữ liệu:** PostgreSQL, Redis

## Yêu cầu

- Node.js ≥ 20.19
- Rust stable + `cargo-watch` (`cargo install cargo-watch`)
- PostgreSQL và Redis

## Chạy dev

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# sửa DATABASE_URL / REDIS_URL trong backend/.env

npm install
npm run migrate
npm run dev
```

Mở http://localhost:5173.

## Build

```bash
npm run build
```

Hoặc dùng Docker:

```bash
docker build -t hangmu-backend  ./backend
docker build -t hangmu-frontend ./frontend
```

## Giấy phép ảnh

Ảnh trên tường huyền thoại lấy từ Wikimedia Commons (CC BY / CC BY-SA); thông tin tác giả và giấy phép hiển thị trong trang (nút © khi ở trong hang).
