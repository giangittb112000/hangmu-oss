import { useEffect, useRef } from 'react'
import { config } from '../config'
import { closeLegal, setConsent, useConsent, useLegalOpen, analyticsConfigured } from './legal'

export function LegalDialog() {
  const open = useLegalOpen()
  const consent = useConsent()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeLegal()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  return (
    <div
      className="legal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && closeLegal()}
    >
      <div
        ref={box}
        className="legal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-title"
        tabIndex={-1}
      >
        <div className="legal-head">
          <h2 id="legal-title">Điều khoản &amp; Quyền riêng tư</h2>
          <button type="button" className="legal-close" aria-label="Đóng" onClick={closeLegal}>
            ×
          </button>
        </div>
        <div className="legal-body">
          <h3>Trang của người hâm mộ</h3>
          <p>
            Hang MU là sân chơi phi lợi nhuận do fan tự làm,{' '}
            <b>không liên kết, không được tài trợ hay chứng thực</b> bởi Manchester United, Premier
            League hay bất kỳ tổ chức nào. Tên, logo CLB thuộc về chủ sở hữu tương ứng và chỉ dùng
            để thể hiện tình yêu với đội bóng.
          </p>

          <h3>Video và hình ảnh</h3>
          <p>
            Video trên bảng tin được <b>nhúng trực tiếp từ kênh YouTube chính thức</b> của
            Manchester United qua trình phát của YouTube — Hang MU không tải xuống hay phát lại
            video. Trang <b>không phát trực tiếp trận đấu</b>; tỷ số chỉ là thông tin kết quả. Ảnh
            huyền thoại lấy từ Wikimedia Commons theo giấy phép CC (xem nút ©). Chủ sở hữu nội dung
            muốn gỡ, vui lòng liên hệ — chúng tôi sẽ gỡ ngay.
          </p>

          <h3>Chat và hành vi</h3>
          <ul>
            <li>Lịch sự với anh em. Không chửi bới, xúc phạm, phân biệt, quấy rối.</li>
            <li>
              Không đăng nội dung vi phạm pháp luật Việt Nam, không spam, quảng cáo, cá độ, lừa đảo.
            </li>
            <li>Không đặt tên mạo danh người khác hoặc tên phản cảm.</li>
            <li>
              Từ ngữ thô tục được lọc tự động. Tin nhắn chỉ hiện trực tiếp,{' '}
              <b>không được lưu lại</b>.
            </li>
            <li>
              <b>Bắt chuyện</b> (chat riêng 2 người) chỉ mở khi người kia đồng ý — không muốn thì
              bấm &quot;Để sau&quot;. Đường link và số điện thoại trong tin riêng bị che để chống
              lừa đảo.
            </li>
          </ul>

          <h3>Dữ liệu chúng tôi xử lý</h3>
          <ul>
            <li>
              <b>Tên và số áo</b> bạn nhập: hiện cho người trong hang. Máy chủ lưu tên + số áo kèm
              một mã ngẫu nhiên trong <b>14 ngày kể từ lần vào hang gần nhất</b> để lần sau bạn
              không phải nhập lại và được giữ chỗ ~30 giây khi rớt mạng; quá hạn thì tự xoá. Xoá
              ngay: xoá cookie / dữ liệu trang Hang MU trong cài đặt trình duyệt (dữ liệu trên máy
              chủ tự hết hạn sau 14 ngày).
            </li>
            <li>
              <b>Cookie cần thiết</b> <code>hm_sid</code> (HttpOnly): chỉ chứa mã ngẫu nhiên để máy
              chủ nhận ra bạn — không theo dõi, không quảng cáo, nên không cần hỏi đồng ý. Xoá
              cookie = thành người mới.
            </li>
            <li>
              <b>Tin nhắn chat, tin nhắn riêng, vị trí nhân vật</b>: chuyển tiếp trực tiếp (tin
              riêng chỉ tới đúng người kia), không lưu.
            </li>
            <li>
              <b>Thông tin kỹ thuật</b> (địa chỉ IP, trình duyệt) có thể có trong nhật ký máy chủ để
              vận hành và chống phá hoại.
            </li>
            <li>
              <b>Cookie phân tích</b> (Google Analytics qua Google Tag Manager) để đếm lượt truy cập
              — <b>chỉ khi bạn đồng ý</b>. Không dùng để quảng cáo.
            </li>
            <li>
              Cài đặt trên máy bạn (âm lượng, ẩn chat…) lưu trong trình duyệt, không gửi lên máy
              chủ.
            </li>
          </ul>
          <p>
            Hang MU không bán, không chia sẻ dữ liệu cá nhân. Bạn có thể rút lại đồng ý cookie bất
            kỳ lúc nào bên dưới, hoặc xoá dữ liệu trang trong cài đặt trình duyệt.
          </p>
          {analyticsConfigured() && (
            <p className="legal-consent">
              Cookie phân tích:{' '}
              <b>
                {consent === 'yes' ? 'đang bật' : consent === 'no' ? 'đã từ chối' : 'chưa chọn'}
              </b>
              {consent === 'yes' ? (
                <button type="button" onClick={() => setConsent('no')}>
                  Tắt
                </button>
              ) : (
                <button type="button" onClick={() => setConsent('yes')}>
                  Đồng ý
                </button>
              )}
            </p>
          )}

          <h3>Ủng hộ</h3>
          <p>
            Tiền ủng hộ là <b>tự nguyện</b>, dùng để trả chi phí máy chủ, không hoàn lại và{' '}
            <b>không phải quyên góp từ thiện</b>. Ủng hộ không đổi lấy quyền lợi gì trong hang.
          </p>

          <h3>Liên hệ</h3>
          <p>
            Góp ý, báo vi phạm, yêu cầu gỡ nội dung hoặc về dữ liệu cá nhân:{' '}
            {config.telegramUrl ? (
              <a href={config.telegramUrl} target="_blank" rel="noopener noreferrer">
                group Telegram Hang MU
              </a>
            ) : (
              'qua group Telegram Hang MU'
            )}
            .
          </p>
        </div>
      </div>
    </div>
  )
}
